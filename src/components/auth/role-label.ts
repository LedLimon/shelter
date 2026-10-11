import type { UserRole } from "@/generated/prisma/enums";

/** Role names as docs/product.md#роли calls them. */
export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Владелец",
  ADMIN: "Админ",
  EDITOR: "Куратор",
  COORDINATOR: "Координатор волонтёров",
  VOLUNTEER: "Волонтёр",
  DONOR: "Донор",
};
