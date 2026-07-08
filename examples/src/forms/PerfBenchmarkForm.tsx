import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { type FieldFormApi, useField, useForm } from "formstand";
import { useDemoForm } from "../demo/DemoShell";
import { z } from "zod";

const SIZES = [10, 50, 200, 500] as const;
type Size = (typeof SIZES)[number];

const buildSchema = (n: number) =>
  z.object(
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`field${i}`, z.string()] as const),
    ),
  );

const buildInitial = (n: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`field${i}`, ""] as const),
  );

type RowProps = Readonly<{
  form: FieldFormApi;
  path: string;
  onRender: () => void;
}>;

const Row = ({ form, path, onRender }: RowProps) => {
  const field = useField(form, path);
  onRender();
  return (
    <input
      value={(field.value as string) ?? ""}
      onChange={(e) => field.setValue(e.target.value)}
      placeholder={path}
      style={{
        background: "#0b0d12",
        border: "1px solid #2a3140",
        color: "#e6ebf5",
        padding: "6px 10px",
        borderRadius: 4,
        fontSize: 13,
        width: "100%",
      }}
    />
  );
};

type RunResult = Readonly<{
  size: Size;
  ms: number;
  renderCount: number;
}>;

type BenchmarkProps = Readonly<{
  size: Size;
  appendResult: (r: RunResult) => void;
}>;

const Benchmark = ({ size, appendResult }: BenchmarkProps) => {
  const schema = useMemo(() => buildSchema(size), [size]);
  const initial = useMemo(() => buildInitial(size), [size]);
  const form = useForm(schema, { initialValues: initial, mode: "onSubmit" });
  useDemoForm(form);
  const renderCounterRef = useRef({ count: 0 });
  const onRender = () => {
    renderCounterRef.current.count += 1;
  };

  const paths = useMemo(
    () => Array.from({ length: size }, (_, i) => `field${i}`),
    [size],
  );

  const runBenchmark = () => {
    const path = `field${Math.floor(size / 2)}`;
    const before = renderCounterRef.current.count;
    const start = performance.now();
    Array.from({ length: 100 }).forEach((_, i) => {
      flushSync(() => {
        form.setValue(path, `iter-${i}`);
      });
    });
    const ms = performance.now() - start;
    const rendersInLoop = renderCounterRef.current.count - before;
    appendResult({
      size,
      ms: ms / 100,
      renderCount: rendersInLoop / 100,
    });
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="primary" type="button" onClick={runBenchmark}>
          Run 100 setValue iterations
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 4,
          maxHeight: 300,
          overflow: "auto",
          border: "1px solid #1f2530",
          borderRadius: 6,
          padding: 8,
        }}
      >
        {paths.map((path) => (
          <Row key={path} form={form} path={path} onRender={onRender} />
        ))}
      </div>
    </>
  );
};

export const PerfBenchmarkForm = () => {
  const [size, setSize] = useState<Size>(50);
  const [results, setResults] = useState<readonly RunResult[]>([]);

  const appendResult = (r: RunResult) =>
    setResults((prev) => [...prev, r]);

  return (
    <div>
      <p className="subtitle">
        Synthetic benchmark: a flat form with N string fields rendered via{" "}
        <code>useField</code>. The "renders / setValue" column counts how many
        Row components re-render per setValue (ideally 1: the targeted field).
      </p>

      <div className="row" style={{ marginBottom: 16 }}>
        <label>Form size:</label>
        <select
          value={size}
          onChange={(e) => {
            setResults([]);
            setSize(Number(e.target.value) as Size);
          }}
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          type="button"
          onClick={() => setResults([])}
        >
          Clear
        </button>
      </div>

      {results.length > 0 ? (
        <table
          style={{
            width: "100%",
            marginBottom: 16,
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#b0b8c7" }}>
              <th style={{ padding: 6, borderBottom: "1px solid #1f2530" }}>
                Size
              </th>
              <th style={{ padding: 6, borderBottom: "1px solid #1f2530" }}>
                ms / setValue
              </th>
              <th style={{ padding: 6, borderBottom: "1px solid #1f2530" }}>
                renders / setValue
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td style={{ padding: 6 }}>{r.size}</td>
                <td style={{ padding: 6 }}>{r.ms.toFixed(3)}</td>
                <td style={{ padding: 6 }}>{r.renderCount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <Benchmark key={size} size={size} appendResult={appendResult} />
    </div>
  );
};
