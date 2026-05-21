"use client";

import { useState } from "react";

type Notification = { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string; };

const TYPE_COLOR: Record<string, string> = {
  OVER_ALLOCATION: "bad", LEAVE_REQUEST: "warn", TIMESHEET_SUBMITTED: "ok",
  TIMESHEET_APPROVED: "ok", TIMESHEET_REJECTED: "bad", RESOURCE_REQUEST: "warn",
  PROJECT_UPDATE: "idle", SYSTEM: "idle",
};

interface Props { notifications: Notification[]; }

export function NotificationsClient({ notifications: initial }: Props) {
  const [items, setItems] = useState(initial);

  async function markRead(id: string) {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setItems((s) => s.map((n) => n.id === id ? { ...n, isRead: true } : n));
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAllRead: true }) });
    setItems((s) => s.map((n) => ({ ...n, isRead: true })));
  }

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div className="page" data-screen-label="Notifications">
      <div className="page-head">
        <div><h1 className="page-title">Notifications</h1><div className="page-sub">{unread} unread</div></div>
        <div className="page-actions">
          {unread > 0 && <button className="btn" onClick={markAllRead}>Mark all read</button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((n) => (
          <div key={n.id} className="card" style={{ display: "flex", gap: 12, alignItems: "flex-start", opacity: n.isRead ? 0.65 : 1 }}>
            <span className={`chip chip-${TYPE_COLOR[n.type] ?? "idle"}`} style={{ fontSize: 10, marginTop: 2, flexShrink: 0 }}>
              {n.type.replace(/_/g, " ")}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{n.message}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{new Date(n.createdAt).toLocaleString()}</div>
            </div>
            {!n.isRead && (
              <button className="btn sm" onClick={() => markRead(n.id)} style={{ flexShrink: 0 }}>Mark read</button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>No notifications yet.</div>
        )}
      </div>
    </div>
  );
}
