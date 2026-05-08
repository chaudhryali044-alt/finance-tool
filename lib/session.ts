export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("meridian_session");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("meridian_session", id);
  }
  return id;
}
