export function roleLabel(role: "super_admin" | "admin" | "editor") {
  return {
    super_admin: "Super administrator",
    admin: "Administrator",
    editor: "Editor",
  }[role];
}
