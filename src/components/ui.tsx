import { useId, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Route to go back to; `true` uses browser history. */
  back?: string | true;
  actions?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back === true ? (
        <button type="button" className="back-link" aria-label="Back" onClick={() => navigate(-1)}>
          ‹
        </button>
      ) : back ? (
        <Link className="back-link" to={back} aria-label="Back">
          ‹
        </Link>
      ) : null}
      <h1>
        {title}
        {subtitle && <span className="subtitle">{subtitle}</span>}
      </h1>
      {actions}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <div className="spinner" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-desc` : undefined}
        {...rest}
      />
      {(hint || error) && (
        <span id={`${id}-desc`} className={error ? "error" : "hint"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

export function NumberStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
        >
          −
        </button>
        <input
          id={id}
          className="input"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(Number.isNaN(n) ? min : clamp(n));
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="switch">
      <span className="switch-text">
        <span style={{ fontWeight: 700 }}>{label}</span>
        {description && <span className="muted small">{description}</span>}
      </span>
      <span className="row" style={{ flexWrap: "nowrap" }}>
        <span className="switch-state" aria-hidden="true">
          {checked ? "YES" : "NO"}
        </span>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      </span>
    </label>
  );
}

export function ConfirmActions({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = "Cancel",
  danger,
  busy,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <div className="modal-actions split">
      <button type="button" className="btn btn-secondary btn-lg" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`btn btn-lg ${danger ? "btn-danger" : "btn-primary"}`}
        onClick={onConfirm}
        disabled={busy}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
