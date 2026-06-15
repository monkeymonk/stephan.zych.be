---
layout: post.njk
title: "You Don't Have Dotfiles. You Have Four Problems."
description: "Managing a machine isn't one job — it's four, with conflicting requirements. Here's the split I landed on: a non-mutating shell runtime, an idempotent provisioner, public dotfiles, and a private secretfiles overlay encrypted with SOPS and age."
date: 2026-06-15
tags: [setup, dotfiles, sops, age, shell]
poster: /assets/content/four-repos.webp
---

> **TL;DR** — One `dotfiles` repo is secretly doing four incompatible jobs. So I split them along two axes — *mutating vs non-mutating* and *public vs private* — into four repos with three documented contracts: **runtime** (shell session, never mutates state), **machines** (idempotent provisioner, mutates once), **dotfiles** (public configs + docs, bare overlay on `$HOME`), and **secretfiles** (the private overlay for everything that can't be generic — personal configs and private `runtime` plugins, *plus* credentials encrypted with **SOPS + age**, the master key never tracked). Keeping the first three public is the forcing function — it's what makes them agnostic, decoupled, and forkable. The public three work end-to-end with no private overlay present — missing secrets is a normal state, not a degraded one.

Everybody's `dotfiles` repo starts the same way: a `.zshrc`, a `.vimrc`, maybe a bootstrap script. Then it grows. The bootstrap script learns to `pacman -S` a few things. The `.zshrc` starts a background daemon "just on this machine." A `secrets.sh` shows up, gets `git-secret`'d, and now half your shell startup is GPG agent roulette. Two years later you try to clone it onto a fresh laptop and discover it only works on the laptop it grew up on.

The repo is called "dotfiles," but that name is a lie. It's not a pile of dotfiles. It's **a machine's entire operating contract** wearing one trenchcoat. And the reason it's painful is that the jobs inside it have *opposite* requirements — you've been trying to satisfy all of them with one mechanism.

So I stopped. Here's the decomposition I landed on, why it's four and not one, and the part most "my dotfiles" posts skip entirely: how the secrets actually work.

## The two axes nobody draws

Before the repos, the principle. Take everything your "setup" does and sort it on two axes:

- **Does it mutate state?** Installing a package, enabling a systemd unit, writing a file outside the cache — that's mutation. Setting an env var, defining an alias, registering a hook — that's not. Mutation happens *once* and changes the box. Non-mutation happens on *every single shell* and changes nothing.
- **Is it public or private?** A generic `starship` config is public. Your git signing key, your client's API token, your real monitor layout with its hostname in it — private.

That's a 2×2, and the punchline is that **each cell wants a different mechanism**. A thing that runs on every shell must never mutate, or your login gets slow and your machine drifts. A thing that provisions the box must be idempotent and run on demand, not at shell startup. A public thing must be forkable by a stranger. A private thing must never leak into the public thing. You cannot serve all four constraints from one repo with one workflow — and the moment you try, you get the classic failure trio: **secrets bleed into public configs, your shell mutates your system, and you can't reproduce your own setup on a new machine.**

Four cells, four things:

| Thing | Job | Mutates? | Visibility |
| --- | --- | --- | --- |
| **runtime** | shell session: env, aliases, hooks | **never** | public |
| **machines** | provision the box: packages, units | yes, idempotent | public |
| **dotfiles** | the actual config files | no (just files) | public |
| **secretfiles** | identity, keys, tokens | no (just files) | **private** |

Four repos, three contracts (the extension points where they meet), and one hard rule: **the public three must work end-to-end with the private overlay absent.** Missing `secretfiles` is the *normal* state for anyone who isn't me — not a degraded one.

## Public by default is a forcing function

Notice that three of the four are public. That's not bravado — it's the load-bearing decision of the whole design. Keeping `runtime`, `machines`, and `dotfiles` public isn't "sharing my setup"; it's a *discipline* that forces three properties you'd never reliably get from a private monorepo:

- **Agnostic.** A public repo can't assume your hostname, your username, your client list, your home path — the moment it does, you've leaked it. So the public repos *have* to be written generic: paths come from XDG conventions, identity comes from an `include`, host specifics come from the overlay. The privacy boundary is what forces the parametrization that makes the setup forkable in the first place.
- **Decoupled.** Each public repo must run with the overlay absent. That single rule kills hidden coupling — no public repo may depend on a private file existing, or it breaks on a clean clone. Because "no `secretfiles`" is a supported state, the seams between repos have to be real and documented, not incidental.
- **Honest.** Code you know strangers can read gets better. You write the README. You delete the dead plugin. You don't hardcode the token "just for now." Public is a standing code review by an audience of everyone.

The leftover — everything that genuinely *can't* be made agnostic — is precisely what defines `secretfiles`. The public/private line isn't secrecy for its own sake; it's the line between *generic* and *specifically yours*. Draw it honestly and good architecture falls out as a side effect: the decoupling, the documented contracts, the forkability all exist *because* the majority had to survive being public.

## 1. runtime — the shell that refuses to touch your system

`runtime` is the framework that loads on every interactive shell: it sets env vars, defines aliases, registers hooks, lazy-loads functions, memoizes into `~/.cache/`. It lives at `~/.config/runtime/` — a plain git checkout, like `~/machines/`. (Two clones you `git pull`; the two `$HOME`-overlay repos come later.)

It has exactly one law, and the whole architecture hangs off it: **runtime never mutates persistent state.** No installing packages. No starting daemons. No writing into `~/.config/` or `$HOME`. No poking systemd. Nothing that survives the shell closing.

Why so strict? Because this code runs *hundreds of times a day*, in every terminal, in every SSH session, inside every script that opens a login shell. Anything that mutates from here is a landmine — a slow login, a daemon double-started, a file written from a context where it shouldn't be. The classic offender:

```sh
# BEFORE — a "plugin" that auto-starts a daemon at shell load
runtime_plugin_llama() {
    has_cmd llama-server || return 0
    [ "$AI_AUTOSTART" = "1" ] && llama-swap &   # ← forks a process on every shell
}
```

That `&` is the bug. It mutates process state from a thing that runs on every shell. The fix isn't to gate it harder — it's to recognize the daemon's lifecycle doesn't *belong* in runtime at all:

```sh
# AFTER — runtime only sets env + aliases; systemd owns the lifecycle
runtime_plugin_llama() {
    has_cmd llama-server || return 0
    export LLAMA_HOST="${LLAMA_HOST:-127.0.0.1:8080}"
    alias llama-up='systemctl --user start llama-swap.service'
    alias llama-down='systemctl --user stop llama-swap.service'
}
```

The daemon moves to a systemd user unit. The *recurring/background* concern leaves runtime. The *install* concern (below) leaves too. What's left is pure, fast, non-mutating session setup — and it can ship a `runtime-doctor` that tells you exactly which plugins are loaded, which hooks fired, and whether your secret loaders are healthy, because it never has side effects to hide.

## 2. machines — the provisioner that runs once and means it

Everything runtime is forbidden to do, `machines` does. It's an **idempotent role applier**: `apply.sh --host workstation` resolves a host to a list of roles and runs each one. Install git/age/sops. Enable systemd units. Create XDG directories. Each role is a recipe that's safe to run a hundred times — run it again and it's a no-op.

```
apply.sh [--host HOST] [--dry-run] [--list] [--only ROLE]
```

The key design choice is **idempotency over tags**. There's no `--public` / `--private` flag. Each role is self-detecting: when the private overlay is absent, a role that wants overlay content (extra units, host-specific env) logs an info line and exits 0 instead of failing. Install the overlay later, re-run `apply.sh`, and it picks up the new state. The contract is "exit code = truth" — a role owns its own consistency; the applier just accumulates pass/fail and reports.

This is the half of "dotfiles" that has no business running at shell startup, given its own home and its own on-demand entrypoint.

## 3 & 4. The bare-overlay trick — and where secrets actually live

The last two repos hold *files that land in `$HOME`* — your real configs. They use the [bare-repo-over-`$HOME`](https://www.atlassian.com/git/tutorials/dotfiles) pattern: a git repo whose work-tree *is* your home directory, driven through an alias.

```sh
alias dotfiles='git --git-dir=$HOME/.dotfiles --work-tree=$HOME'
alias secretfiles='git --git-dir=$HOME/.secretfiles --work-tree=$HOME'
```

`dotfiles` (public) holds the safe configs and the documentation hub. `secretfiles` (private) holds everything with your name on it. The clever part is that **they overlay the same `$HOME`** — and that's how a config stays public while its sensitive half stays private:

- `dotfiles` ships `~/.config/git/config` with `[include] path = ~/.config/git/user.local`.
- `secretfiles` ships `~/.config/git/user.local` — your name, email, signing key.
- `dotfiles` ships `monitors.kdl` via `include optional=true`; `secretfiles` provides the real per-machine `monitors.kdl`. Present → loaded. Absent → the public config still works.

(One small gotcha when two bare repos check out into the same `$HOME`: they'd both want a top-level `README.md`. So the private one's lives at `SECRETFILES.md` to avoid the collision.)

That's the structure. Now the part that actually matters.

## secretfiles: the private overlay (not just a vault)

Here's the trap to avoid: thinking `secretfiles` is "the encrypted secrets repo." It isn't. It's the **private overlay** — the home for everything that flunked the public-by-default test, and most of that *isn't a secret at all.* Two distinct kinds of content live here, and conflating them is how people either over-encrypt junk or, worse, push personal data to a public repo because "it's not really a secret."

**Kind one — private but not secret.** Config and code that carries no credential, but would *leak who and where you are*, or is simply too bespoke to ever be generic:

- `~/.config/git/user.local` — your name, email, signing key. Not secret. Just *you*. It's the file the public `dotfiles` config `include`s.
- Per-machine hardware config — the real `monitors.kdl`, the `kanshi` display profiles with their actual outputs. Useless to anyone else, and they pin down your physical setup.
- **Private `runtime` plugins and scripts.** This is the one people miss. My `runtime` repo is public and generic — but I have plugins like `cherrylab.sh`, `workenv.sh`, `ai-capabilities.sh`, and a `cherrylab` CLI wrapper that reference client names, internal hostnames, and workflows that have no business in a public repo. They aren't encrypted — they're just shell scripts. They live in `secretfiles` and get *dropped into* `runtime`'s plugin directory as an overlay. The public framework stays agnostic; the personal extensions stay private. Same for a private `machines` role (`niri-stack`, my CachyOS desktop bundle) that sits in the overlay's `roles/` and resolves automatically.
- `host.env` and `roles.list` for my actual machine — the file that says *this* box is `workstation` and runs *these* roles.

None of that is encrypted, because encryption isn't the point for this kind — *visibility* is. It would compromise privacy, not security, to publish it. Keeping it in the private overlay is the entire mechanism.

**Kind two — actual secrets.** Tokens, keys, credentials. These *are* encrypted at rest, because a "private repo" is not a secrets strategy: the repo is one `git remote add` typo away from public, and you do not want your `~/.ssh/id_ed25519` sitting there in plaintext when that happens. The tooling is [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age).

The boundary rule that keeps the two straight: **generic and forkable → public repo. Personal identifier → private overlay, plaintext. Actual credential → private overlay, encrypted.** One repo, two storage modes, picked by *what the content is.*

### Secrets, for real: SOPS + age

So the credentials get encrypted at rest. I came from `git-secret` + GPG. It works. It also drags in decades of GPG complexity — keyrings, agents, expirations, web-of-trust, revocation certs — for a problem that is just "encrypt some files for one person." SOPS + age trades all of that for:

- **One key model.** A single age keypair. No keyring state, no `gpg-agent` deciding today is the day it forgets your passphrase. age is ~1000 lines, X25519 + ChaCha20-Poly1305, auditable in an afternoon.
- **Diff-able ciphertext.** SOPS encrypts *values*, not whole files. Change one variable and you get a one-line diff — you can review *which* secret changed in a PR without the values ever being visible.
- **Decrypt at point of use.** Secrets go straight into env vars, `ssh-agent`, or the AWS SDK's memory. No `reveal` / `hide` dance leaving plaintext scattered across `$HOME`.

### The architecture

One age keypair is the master. The split that makes the whole thing safe:

- The **public** key goes in `.sops.yaml`, committed to `secretfiles`. Not sensitive.
- The **private** key lives at `~/.config/sops/age/keys.txt`, mode `600`, and is **never tracked — not even in the private repo.** It exists on disk, on an offline USB, and in a password-manager secure note. That's it. Lose it and every secret is gone; leak it and the private repo's encryption is moot. It is the one thing that never touches git.

A `.sops.yaml` at the repo root tells SOPS who to encrypt to, so `sops <file>` just does the right thing:

```yaml
creation_rules:
  - path_regex: \.(env|ya?ml|json)$
    age: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Two encryption styles, picked by file type:

| File type | Tool | Why |
| --- | --- | --- |
| `*.env`, `*.yaml`, `*.json` | **SOPS** | encrypts values only → keys/structure stay diff-able |
| SSH keys, certs, blobs | **plain `age`** | pipes straight into `ssh-add`, no YAML wrapper |
| AWS credentials | SOPS + `credential_process` | decrypted into the SDK's memory, never to disk |

### Editing a secret

```sh
sops ~/.config/shell/secrets.env
```

That opens `$EDITOR` on the *decrypted* view, re-encrypts on save. You never handle ciphertext by hand, and you never write a plaintext file to disk to edit it. Commit the encrypted result like anything else:

```sh
secretfiles add ~/.config/shell/secrets.env
secretfiles commit -m "Rotate GITHUB_TOKEN"
secretfiles push
```

### Getting them into the shell — without mutating from the shell

Here's where the architecture pays off. Decrypting secrets is a *mutation* (it writes a decrypted file, or touches the agent), so by the runtime law it **cannot** happen from a shell plugin. Instead a **systemd user unit** owns it: `secrets-cache.service` decrypts `secrets.env` once at login into a tmpfs-friendly location, and runtime's loader merely *sources* whatever is already there — non-silent on failure (present-but-unreadable and source-failed both warn loudly; absent is silent, because absent is normal).

SSH keys work the same way: `ssh-keys-load.service` walks `~/.ssh/*.age`, decrypts each with the master key, and pipes it to `ssh-add` — once, at login, not on every shell:

```sh
for key in "$HOME"/.ssh/*.age; do
    age -d -i "$HOME/.config/sops/age/keys.txt" "$key" | ssh-add - 2>/dev/null
done
```

AWS never even gets a plaintext file: `~/.aws/credentials` just declares a `credential_process` that runs `sops -d --extract` on demand, so the secret only ever exists in the SDK's memory for the life of a request.

### A new machine, from nothing

This is the test that the whole design exists to pass:

```sh
# 1. age private key — from the password manager, NEVER from a repo
mkdir -p ~/.config/sops/age
$EDITOR ~/.config/sops/age/keys.txt && chmod 600 ~/.config/sops/age/keys.txt

# 2. clone runtime + machines, then the bare overlays into $HOME
git clone https://github.com/monkeymonk/runtime.git ~/.config/runtime
git clone https://github.com/monkeymonk/machines.git ~/machines
git clone --bare git@github.com:monkeymonk/secretfiles.git ~/.secretfiles
secretfiles checkout

# 3. enable the units; secrets decrypt on demand from here on
systemctl --user enable --now secrets-cache.service ssh-keys-load.service
```

No `git-secret reveal`. No GPG import ceremony. Paste one key, clone, check out, done.

### What it protects against — and what it doesn't

Encryption is not a force field, and pretending otherwise is how people get burned:

- **Protects:** a leaked private repo (ciphertext is opaque without the age key), a casual `git diff` (you see which keys changed, not the values), a stolen disk *if* full-disk encryption is on — because the age key itself sits in plaintext on disk, so FDE is still mandatory.
- **Does not protect:** a compromised running session. Any process running as you can read the age key *and* the secrets already decrypted into memory. This is exactly why [I run my agents in a box](/blog/ai-agent-sandboxing/) — encryption at rest and a sandbox at runtime solve different halves of the same problem.
- **The rule encryption can't save you from:** changing the *tool* never secures an *already-leaked* secret. The old ciphertext lives in git history forever; if the old key is ever compromised, those values are gone. So when you migrate or when anything might have leaked — **rotate the underlying secret upstream.** New token, new key, new everything. Encryption protects values you haven't leaked yet.

## The closer: some things aren't setup at all

Once you've drawn these boundaries, you start noticing squatters. Things living in your "dotfiles" that aren't configuration *or* provisioning *or* secrets — they're **tools** that just happened to grow up there.

For me it was `tips` — a little shell tip aggregator with pluggable providers (a static file, remote URLs, a local LLM). It had an installer, its own config, its own tests. It wasn't part of my *setup*; it was a *program* my setup happened to use. So it graduated: its own repo, its own `curl | bash` install, forkable by anyone, depending on none of my four.

That's the real lesson, and it generalizes past my specific repos. A machine setup isn't one thing and it isn't even four things — it's **a small set of concern-repos with clean contracts, plus a constellation of tools that earned their independence.** The skill isn't tidiness. It's knowing which is which: what mutates vs what loads, what's yours vs what's generic, and what was never setup to begin with.

You don't have dotfiles. You have four problems and a toolbox. Name them, and each one gets easy.

---

*The four repos live at [github.com/monkeymonk](https://github.com/monkeymonk/) — `runtime`, `machines`, `dotfiles`, and the private `secretfiles`. They're being cleaned up and made forkable; links go public as each one flips.*
