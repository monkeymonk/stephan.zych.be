import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { registry } from '../core/registry.js';

@customElement('sz-contact-form')
export class SzContactForm extends LitElement {
  @state() private confirmation = '';

  static styles = css`
    :host {
      display: block;
      font-family: 'JetBrains Mono', 'Fira Code', 'SFMono-Regular', Consolas, monospace;
      color: var(--sz-text, #cdd6f4);
    }

    form {
      display: grid;
      gap: 1.5rem;
      max-width: 42rem;
    }

    .field {
      display: grid;
      gap: 0.5rem;
    }

    label {
      color: var(--sz-command-highlight, var(--sz-accent, #89b4fa));
      font-size: var(--sz-font-size, 13px);
    }

    input,
    textarea {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: none;
      border-radius: 4px;
      background: var(--sz-surface0, #313244);
      color: var(--sz-text, #cdd6f4);
      font: inherit;
      outline: none;
      box-sizing: border-box;
      transition: background 0.2s ease, color 0.2s ease;
    }

    textarea {
      min-height: 8rem;
      resize: vertical;
    }

    input::placeholder,
    textarea::placeholder {
      color: var(--sz-overlay0, #6c7086);
    }

    input:focus,
    textarea:focus {
      background: var(--sz-surface1, #45475a);
    }

    button {
      justify-self: start;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--sz-green, #a6e3a1);
      font: inherit;
      cursor: pointer;
    }

    button:hover,
    button:focus-visible {
      color: var(--sz-yellow, #f9e2af);
      outline: none;
    }

    .confirmation {
      color: var(--sz-green, #a6e3a1);
      min-height: 1.25rem;
    }
  `;

  private formatMessage(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();

    return [
      'Contact request',
      `Name: ${name}`,
      `Email: ${email}`,
      '',
      'Message:',
      message,
    ].join('\n');
  }

  private async handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const message = this.formatMessage(formData);
    const subject = encodeURIComponent(`Contact from ${String(formData.get('name') ?? '').trim() || 'website visitor'}`);
    const body = encodeURIComponent(message);

    try {
      await navigator.clipboard.writeText(message);
      this.confirmation = 'Message copied!';
    } catch {
      window.location.href = `mailto:${registry.email}?subject=${subject}&body=${body}`;
      this.confirmation = 'Opening mail client...';
    }
  }

  render() {
    return html`
      <form @submit=${this.handleSubmit}>
        <div class="field">
          <label for="name">&gt; name:</label>
          <input id="name" name="name" type="text" autocomplete="name" required />
        </div>
        <div class="field">
          <label for="email">&gt; email:</label>
          <input id="email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="message">&gt; message:</label>
          <textarea id="message" name="message" required></textarea>
        </div>
        <button type="submit">:send</button>
        <div class="confirmation" role="status" aria-live="polite">${this.confirmation}</div>
      </form>
    `;
  }
}
