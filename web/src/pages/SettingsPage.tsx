import { FormEvent, useEffect, useState } from "react";
import { api, AppSettings } from "../api";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch((e) => setError(e.message));
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api.saveSettings({
        dataDirectory: settings.dataDirectory,
        document: settings.document,
      });
      setSettings(next);
      setMessage("설정을 저장했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  if (!settings) return <div className="muted">불러오는 중…</div>;

  return (
    <section className="panel">
      <h1>설정</h1>
      <p className="muted">데이터 저장 위치와 문서 헤더 정보를 관리합니다. 로그인 기능은 없습니다.</p>

      <form onSubmit={onSubmit} className="form-grid">
        <label className="full">
          데이터 디렉터리
          <input
            value={settings.dataDirectory}
            onChange={(e) => setSettings({ ...settings, dataDirectory: e.target.value })}
          />
        </label>
        <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
          기본 경로: {settings.defaultDataDirectory}
        </p>

        <label>
          시스템명
          <input
            value={settings.document.systemName}
            onChange={(e) =>
              setSettings({
                ...settings,
                document: { ...settings.document, systemName: e.target.value },
              })
            }
          />
        </label>
        <label>
          문서 버전
          <input
            value={settings.document.documentVersion}
            onChange={(e) =>
              setSettings({
                ...settings,
                document: { ...settings.document, documentVersion: e.target.value },
              })
            }
          />
        </label>
        <label>
          작성자
          <input
            value={settings.document.author}
            onChange={(e) =>
              setSettings({
                ...settings,
                document: { ...settings.document, author: e.target.value },
              })
            }
          />
        </label>
        <label>
          회사/팀
          <input
            value={settings.document.company}
            onChange={(e) =>
              setSettings({
                ...settings,
                document: { ...settings.document, company: e.target.value },
              })
            }
          />
        </label>
        <label>
          작성일
          <input
            value={settings.document.writtenAt}
            onChange={(e) =>
              setSettings({
                ...settings,
                document: { ...settings.document, writtenAt: e.target.value },
              })
            }
          />
        </label>

        <div className="row" style={{ gridColumn: "1 / -1" }}>
          <button className="btn primary" type="submit" disabled={busy}>
            저장
          </button>
        </div>
      </form>

      {message && <div className="msg ok">{message}</div>}
      {error && <div className="msg error">{error}</div>}
    </section>
  );
}
