package main

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"time"
)

// WakapiLang is one language row in the coding-stats widget.
type WakapiLang struct {
	Name    string
	Percent int
	Text    string
}

// WakapiStats is the sanitized last-7-days summary (nil when unavailable).
type WakapiStats struct {
	Range        string
	Total        string
	DailyAverage string
	Languages    []WakapiLang
}

var wakapiPretty = map[string]string{
	"Gdscript3": "GDScript",
	"Qml":       "QML",
	"Tsx":       "TSX",
	"Jsx":       "JSX",
	"Json":      "JSON",
}

// FetchWakapi pulls the last-7-days stats. Returns nil if WAKAPI_API_KEY is
// unset or the request fails — callers simply omit the widget (same as web).
func FetchWakapi() *WakapiStats {
	key := os.Getenv("WAKAPI_API_KEY")
	if key == "" {
		return nil
	}
	apiURL := os.Getenv("WAKAPI_API_URL")
	if apiURL == "" {
		return nil
	}

	req, err := http.NewRequest(http.MethodGet, apiURL+"/api/compat/wakatime/v1/users/current/stats/last_7_days", nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(key)))

	client := &http.Client{Timeout: 6 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil
	}

	var payload struct {
		Data struct {
			HumanReadableRange        string `json:"human_readable_range"`
			HumanReadableTotal        string `json:"human_readable_total"`
			HumanReadableDailyAverage string `json:"human_readable_daily_average"`
			Languages                 []struct {
				Name    string  `json:"name"`
				Percent float64 `json:"percent"`
				Text    string  `json:"text"`
			} `json:"languages"`
		} `json:"data"`
	}
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return nil
	}

	out := &WakapiStats{
		Range:        orDefault(payload.Data.HumanReadableRange, "last 7 days"),
		Total:        payload.Data.HumanReadableTotal,
		DailyAverage: payload.Data.HumanReadableDailyAverage,
	}
	for _, l := range payload.Data.Languages {
		if l.Name == "" || l.Name == "Unknown" || l.Name == "Other" {
			continue
		}
		name := l.Name
		if p, ok := wakapiPretty[name]; ok {
			name = p
		}
		out.Languages = append(out.Languages, WakapiLang{Name: name, Percent: int(l.Percent + 0.5), Text: l.Text})
		if len(out.Languages) >= 6 {
			break
		}
	}
	return out
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}
