import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, Connection, DBMS_LABELS, TableRef } from "../api";

export default function ExplorePage() {
  const navigate = useNavigate();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [schemas, setSchemas] = useState<string[]>([]);
  const [schema, setSchema] = useState("");
  const [tables, setTables] = useState<TableRef[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listConnections()
      .then((list) => {
        setConnections(list);
        if (list[0]) setConnectionId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!connectionId) return;
    setBusy(true);
    setError("");
    api
      .listSchemas(connectionId)
      .then((list) => {
        setSchemas(list);
        setSchema(list[0] || "");
        setTables([]);
        setSelected({});
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId || !schema) return;
    setBusy(true);
    setError("");
    api
      .listTables(connectionId, schema, q)
      .then((list) => {
        setTables(list);
      })
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, [connectionId, schema, q]);

  const keyOf = (t: TableRef) => `${t.schema}.${t.name}`;

  const selectedTables = tables.filter((t) => selected[keyOf(t)]);

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) for (const t of tables) next[keyOf(t)] = true;
    setSelected(next);
  };

  const collect = async () => {
    if (!selectedTables.length) {
      setError("테이블을 하나 이상 선택하세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const snapshot = await api.collect(connectionId, selectedTables);
      navigate(`/snapshots/${snapshot.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수집 실패");
    } finally {
      setBusy(false);
    }
  };

  const current = connections.find((c) => c.id === connectionId);

  return (
    <div className="panel">
      <h1>탐색 / 정의서 생성</h1>
      <p className="muted">스키마에서 테이블만 선택한 뒤 메타데이터를 수집합니다.</p>

      <div className="form-grid" style={{ marginBottom: "1rem" }}>
        <label>
          연결
          <select value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
            {!connections.length && <option value="">연결 없음</option>}
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({DBMS_LABELS[c.dbms]})
              </option>
            ))}
          </select>
        </label>
        <label>
          스키마
          <select value={schema} onChange={(e) => setSchema(e.target.value)} disabled={!schemas.length}>
            {!schemas.length && <option value="">스키마 없음</option>}
            {schemas.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          테이블 검색
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="테이블명 일부"
          />
        </label>
      </div>

      {current && (
        <p className="muted">
          현재: <span className="mono">{current.name}</span> / {DBMS_LABELS[current.dbms]}
        </p>
      )}

      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <button className="btn" type="button" onClick={() => toggleAll(true)} disabled={!tables.length}>
          전체 선택
        </button>
        <button className="btn" type="button" onClick={() => toggleAll(false)}>
          선택 해제
        </button>
        <button className="btn primary" type="button" onClick={collect} disabled={busy}>
          정의서 생성 ({selectedTables.length})
        </button>
      </div>

      <div className="check-list">
        {tables.map((t) => (
          <label key={keyOf(t)} title={`${t.schema}.${t.name}`}>
            <input
              type="checkbox"
              checked={Boolean(selected[keyOf(t)])}
              onChange={(e) =>
                setSelected((prev) => ({ ...prev, [keyOf(t)]: e.target.checked }))
              }
            />
            <span className="mono">
              {t.schema}.{t.name}
            </span>
          </label>
        ))}
        {!tables.length && <div className="muted" style={{ padding: "0.5rem" }}>테이블이 없습니다.</div>}
      </div>

      {error && <div className="msg error">{error}</div>}
    </div>
  );
}
