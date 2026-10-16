/** Where a profile picture is served, for an `avatar_id`. Shared by server and client. */
export function avatarSrc(id: string, size: "small" | "large"): string {
  return `/api/avatars/${id}/${size}`;
}
