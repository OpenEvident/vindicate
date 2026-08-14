import type { DashboardAlert } from "../../../shared/types";

export function AlertsList({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section>
      <div className="dash-section-h">
        <h4>
          Needs attention
          <span className="count">{alerts.length}</span>
        </h4>
      </div>
      <div className="flex flex-col gap-2">
        {alerts.map((alert) => (
          <article key={`${alert.kind}-${alert.title}`} className={`alert ${alert.severity}`}>
            <div className="icon mt-1 h-2 w-2 rounded-full bg-[var(--ord-amber)]" />
            <div className="min-w-0 flex-1">
              <div className="title">{alert.title}</div>
              <div className="sub">{alert.sub}</div>
            </div>
            {alert.action !== "View failures" && (
              <button type="button" className="vbtn" style={{ fontSize: 10.5 }}>
                {alert.action}
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
