import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  Connection,
  ConnectionInput,
  DBMS_LABELS,
  DbmsType,
} from "../api";

const emptyForm = (): ConnectionInput => ({
  name: "",
  dbms: "postgresql",
  host: "localhost",
  port: 5432,
  database: "",
  user: "",
  password: "",
  filePath: "",
  oracleConnectType: "service",
});

const defaultPorts: Record<DbmsType, number | undefined> = {
  postgresql: 5432,
  mysql: 3306,
  sqlite: undefined,
  mssql: 1433,
  oracle: 1521,
};

export default function ConnectionsPage() {
  const [items, setItems] = useState<Connection[]>([]);
  const [form, setForm] = useState<ConnectionInput>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setItems(await api.listConnections());
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const title = useMemo(() => (editingId ? "연결 수정" : "연결 추가"), [editingId]);

  const onDbmsChange = (dbms: DbmsType) => {
    setForm((f) => ({
      ...f,
      dbms,
      port: defaultPorts[dbms],
      host: dbms === "sqlite" ? undefined : f.host || "localhost",
    }));
  };

  const reset = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (editingId) await api.updateConnection(editingId, form);
      else await api.createConnection(form);
      setMessage(editingId ? "연결을 수정했습니다." : "연결을 추가했습니다.");
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.testConnection(form);
      if (result.ok) setMessage(`연결 성공: ${result.serverVersion}`);
      else setError(result.message || "연결 실패");
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결 실패");
    } finally {
      setBusy(false);
    }
  };

  const onEdit = (c: Connection) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      dbms: c.dbms,
      host: c.host,
      port: c.port,
      database: c.database,
      user: c.user,
      password: "",
      filePath: c.filePath,
      oracleConnectType: c.oracleConnectType || "service",
      options: c.options,
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm("이 연결을 삭제할까요?")) return;
    await api.deleteConnection(id);
    if (editingId === id) reset();
    await load();
  };

  const onTestSaved = async (id: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api.testSavedConnection(id);
      setMessage(`연결 성공: ${result.serverVersion}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid-2">
      <section className="panel">
        <h1>연결 목록</h1>
        <p className="muted">PostgreSQL, MySQL/MariaDB, SQLite, MSSQL, Oracle을 지원합니다.</p>
        <ul className="list">
          {items.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <div className="muted">
                  <span className="badge">{DBMS_LABELS[c.dbms]}</span>{" "}
                  {c.dbms === "sqlite"
                    ? c.filePath
                    : `${c.host}:${c.port} / ${c.database || ""}`}
                </div>
              </div>
              <div className="row">
                <button className="btn" onClick={() => onTestSaved(c.id)} disabled={busy}>
                  테스트
                </button>
                <button className="btn" onClick={() => onEdit(c)}>
                  수정
                </button>
                <button className="btn danger" onClick={() => onDelete(c.id)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
          {!items.length && <li className="muted">등록된 연결이 없습니다.</li>}
        </ul>
      </section>

      <section className="panel">
        <h2>{title}</h2>
        <form onSubmit={onSubmit} className="form-grid">
          <label>
            연결 이름
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            DBMS
            <select
              value={form.dbms}
              onChange={(e) => onDbmsChange(e.target.value as DbmsType)}
            >
              {Object.entries(DBMS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>

          {form.dbms === "sqlite" ? (
            <label className="full">
              파일 경로
              <input
                required
                value={form.filePath || ""}
                onChange={(e) => setForm({ ...form, filePath: e.target.value })}
                placeholder="C:\\data\\app.db"
              />
            </label>
          ) : (
            <>
              <label>
                호스트
                <input
                  value={form.host || ""}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </label>
              <label>
                포트
                <input
                  type="number"
                  value={form.port ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, port: e.target.value ? Number(e.target.value) : undefined })
                  }
                />
              </label>
              <label>
                {form.dbms === "oracle" ? "서비스명 / SID" : "데이터베이스"}
                <input
                  value={form.database || ""}
                  onChange={(e) => setForm({ ...form, database: e.target.value })}
                />
              </label>
              {form.dbms === "oracle" && (
                <label>
                  Oracle 연결 방식
                  <select
                    value={form.oracleConnectType || "service"}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        oracleConnectType: e.target.value as "service" | "sid",
                      })
                    }
                  >
                    <option value="service">Service Name</option>
                    <option value="sid">SID</option>
                  </select>
                </label>
              )}
              <label>
                사용자
                <input
                  value={form.user || ""}
                  onChange={(e) => setForm({ ...form, user: e.target.value })}
                />
              </label>
              <label>
                비밀번호 {editingId ? "(변경 시에만 입력)" : ""}
                <input
                  type="password"
                  value={form.password || ""}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}

          <div className="row" style={{ gridColumn: "1 / -1" }}>
            <button className="btn primary" type="submit" disabled={busy}>
              저장
            </button>
            <button className="btn" type="button" onClick={onTest} disabled={busy}>
              연결 테스트
            </button>
            {editingId && (
              <button className="btn" type="button" onClick={reset}>
                취소
              </button>
            )}
          </div>
        </form>
        {message && <div className="msg ok">{message}</div>}
        {error && <div className="msg error">{error}</div>}
      </section>
    </div>
  );
}
