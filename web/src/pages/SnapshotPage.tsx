import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, Snapshot, TableMeta } from "../api";

function yn(v: boolean) {
  return v ? "Y" : "N";
}

function TableDoc({ table }: { table: TableMeta }) {
  return (
    <div>
      <div className="section-block">
        <h2>
          {table.schema}.{table.name}
        </h2>
        <h3>테이블 개요</h3>
        <div className="table-wrap">
          <table className="data">
            <tbody>
              <tr>
                <th>스키마</th>
                <td>{table.schema}</td>
              </tr>
              <tr>
                <th>테이블명</th>
                <td>{table.name}</td>
              </tr>
              <tr>
                <th>테이블 설명</th>
                <td className="wrap">{table.comment || ""}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-block">
        <h3>컬럼 정의</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>No</th>
                <th>컬럼명</th>
                <th>데이터 타입</th>
                <th>NULL</th>
                <th>PK</th>
                <th>FK</th>
                <th>기본값</th>
                <th>Identity</th>
                <th className="wrap">설명</th>
                <th className="wrap">비고</th>
              </tr>
            </thead>
            <tbody>
              {table.columns.map((c) => (
                <tr key={c.name}>
                  <td>{c.ordinal}</td>
                  <td className="mono">{c.name}</td>
                  <td className="mono">{c.dataType}</td>
                  <td>{yn(c.nullable)}</td>
                  <td>{c.isPk ? "Y" : ""}</td>
                  <td>{c.isFk ? "Y" : ""}</td>
                  <td className="mono wrap">{c.defaultValue ?? ""}</td>
                  <td>{c.identity ? "Y" : ""}</td>
                  <td className="wrap">{c.comment ?? ""}</td>
                  <td className="wrap">{c.fkRef || c.remark || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-block">
        <h3>제약조건</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>제약명</th>
                <th>종류</th>
                <th>컬럼</th>
                <th>참조</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {table.constraints.map((c) => (
                <tr key={c.name}>
                  <td className="mono">{c.name}</td>
                  <td>{c.type}</td>
                  <td className="mono">{c.columns.join(", ")}</td>
                  <td className="mono wrap">{c.ref ?? ""}</td>
                  <td>{c.remark ?? ""}</td>
                </tr>
              ))}
              {!table.constraints.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="section-block">
        <h3>인덱스</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>인덱스명</th>
                <th>유니크</th>
                <th>컬럼</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {table.indexes.map((i) => (
                <tr key={i.name}>
                  <td className="mono">{i.name}</td>
                  <td>{yn(i.unique)}</td>
                  <td className="mono">{i.columns.join(", ")}</td>
                  <td>{i.remark ?? ""}</td>
                </tr>
              ))}
              {!table.indexes.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function SnapshotPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [activeKey, setActiveKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getSnapshot(id)
      .then((s) => {
        setSnapshot(s);
        if (s.tables[0]) setActiveKey(`${s.tables[0].schema}.${s.tables[0].name}`);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const active = snapshot?.tables.find((t) => `${t.schema}.${t.name}` === activeKey);

  const resync = async () => {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const next = await api.resync(id);
      navigate(`/snapshots/${next.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "재동기화 실패");
    } finally {
      setBusy(false);
    }
  };

  if (error && !snapshot) return <div className="msg error">{error}</div>;
  if (!snapshot) return <div className="muted">불러오는 중…</div>;

  return (
    <div>
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1>테이블 정의서</h1>
            <p className="muted">
              수집 시각: {new Date(snapshot.collectedAt).toLocaleString("ko-KR")} · 상태:{" "}
              {snapshot.status}
            </p>
          </div>
          <div className="row">
            <Link className="btn" to="/explore">
              다시 선택
            </Link>
            <button className="btn" onClick={resync} disabled={busy}>
              재동기화
            </button>
            <a className="btn" href={api.exportMarkdownUrl(snapshot.id)}>
              Markdown
            </a>
            <a className="btn primary" href={api.exportExcelUrl(snapshot.id)}>
              Excel
            </a>
          </div>
        </div>
        {!!snapshot.failures.length && (
          <div className="msg error">
            일부 테이블 수집 실패:{" "}
            {snapshot.failures.map((f) => `${f.schema}.${f.name} (${f.error})`).join(", ")}
          </div>
        )}
        {error && <div className="msg error">{error}</div>}
      </div>

      <div className="workspace">
        <aside className="panel side-list">
          <h2>테이블</h2>
          {snapshot.tables.map((t) => {
            const key = `${t.schema}.${t.name}`;
            return (
              <button
                key={key}
                className={key === activeKey ? "active" : ""}
                onClick={() => setActiveKey(key)}
                title={`${t.schema}.${t.name}`}
              >
                <span className="table-name">
                  {t.schema}.{t.name}
                </span>
              </button>
            );
          })}
        </aside>
        <section className="panel">{active ? <TableDoc table={active} /> : <div className="muted">테이블을 선택하세요.</div>}</section>
      </div>
    </div>
  );
}
