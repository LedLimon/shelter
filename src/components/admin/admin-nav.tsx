import { useId } from "react";
import { sectionHref, type AdminNavGroup } from "./nav-config";
import { NavLink } from "./nav-link";

/**
 * The sections a staff member may open, in groups. Rendered twice — in the
 * desktop sidebar and in the mobile drawer — so the ids come from useId().
 */
export function AdminNav({ groups }: { groups: AdminNavGroup[] }) {
  const id = useId();

  return (
    <ul className="flex flex-col gap-3 lg:gap-2">
      {groups.map(({ title, sections }, index) => (
        <li key={title ?? "dashboard"}>
          {title && (
            <p
              id={`${id}-${index}`}
              className="px-2.5 pb-1 font-mono text-mono-sm text-toner-muted"
            >
              {title}
            </p>
          )}
          <ul aria-labelledby={title ? `${id}-${index}` : undefined}>
            {sections.map((section) => (
              <li key={section.slug}>
                <NavLink
                  href={sectionHref(section)}
                  icon={
                    <section.icon aria-hidden className="size-4 shrink-0" />
                  }
                >
                  {section.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
