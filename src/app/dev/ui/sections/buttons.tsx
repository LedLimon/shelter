import {
  ArrowRightIcon,
  HeartHandshakeIcon,
  PencilIcon,
  PlusIcon,
  ShareIcon,
  Trash2Icon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

import type { PreviewState } from "../pseudo-states";
import {
  Paper,
  Section,
  Specimen,
  SpecimenGroup,
  Specimens,
} from "../showcase";

type Variant = NonNullable<ButtonProps["variant"]>;

const VARIANTS: {
  variant: Variant;
  size?: ButtonProps["size"];
  label: ReactNode;
  note: string;
}[] = [
  {
    variant: "help",
    size: "lg",
    label: (
      <>
        <HeartHandshakeIcon aria-hidden data-icon="inline-start" />
        Помочь Бурану
      </>
    ),
    note: "Только «Помочь»: жёлтая бумага в рамке 2 px, всегда size=lg. Один раз на экране.",
  },
  {
    variant: "default",
    label: "Сохранить",
    note: "Главное действие, кроме «Помочь»: тонер, текст цветом бумаги.",
  },
  {
    variant: "outline",
    label: "Отмена",
    note: "Второе действие рядом с главным.",
  },
  {
    variant: "secondary",
    label: "В черновик",
    note: "Тихое действие на бумаге: заливка цветом доски.",
  },
  {
    variant: "ghost",
    label: "Ещё",
    note: "Действия в строках таблиц и меню, кнопки-иконки.",
  },
  {
    variant: "destructive",
    label: (
      <>
        <Trash2Icon aria-hidden data-icon="inline-start" />
        Удалить
      </>
    ),
    note: "Необратимое: рамка и текст цветом ошибки, без кричащей заливки.",
  },
  {
    variant: "link",
    label: "Все пожертвования и чеки",
    note: "Действие, которое выглядит как ссылка в тексте.",
  },
];

const STATES: { label: string; preview?: PreviewState }[] = [
  { label: "обычная" },
  { label: "наведение", preview: "hover" },
  { label: "фокус", preview: "focus-visible" },
  { label: "нажатие", preview: "active" },
];

export function ButtonsSection() {
  return (
    <Section
      id="buttons"
      title="Кнопки"
      description={
        <>
          <code className="font-mono text-mono">Button</code>: прямоугольные,
          акцидентный шрифт капсом. Недоступная теряет заливку и&nbsp;получает
          пунктир; при загрузке кнопка сохраняет вид и&nbsp;фокус, клики
          блокируются (<code className="font-mono text-mono">loading</code>).
        </>
      }
    >
      <Paper>
        {VARIANTS.map(({ variant, size, label, note }) => (
          <SpecimenGroup
            key={variant}
            title={`variant="${variant}"`}
            note={note}
          >
            <Specimens>
              {STATES.map((state) => (
                <Specimen key={state.label} label={state.label}>
                  <Button
                    variant={variant}
                    size={size}
                    data-preview={state.preview}
                  >
                    {label}
                  </Button>
                </Specimen>
              ))}
              <Specimen label="недоступна">
                <Button variant={variant} size={size} disabled>
                  {label}
                </Button>
              </Specimen>
              {variant !== "link" && (
                <Specimen label="загрузка">
                  <Button variant={variant} size={size} loading>
                    Отправляем…
                  </Button>
                </Specimen>
              )}
            </Specimens>
          </SpecimenGroup>
        ))}

        <SpecimenGroup
          title="size"
          note="sm — плотные таблицы админки, default — 44 px, lg — 52 px для «Помочь» и главного действия на мобильном. Иконки: icon 44 px, icon-sm 36 px; подпись — в aria-label."
        >
          <Specimens className="items-end">
            <Specimen label="sm">
              <Button size="sm">
                <PlusIcon aria-hidden data-icon="inline-start" />
                Добавить
              </Button>
            </Specimen>
            <Specimen label="default">
              <Button>
                Дальше
                <ArrowRightIcon aria-hidden data-icon="inline-end" />
              </Button>
            </Specimen>
            <Specimen label="lg">
              <Button size="lg">Стать опекуном</Button>
            </Specimen>
            <Specimen label="icon">
              <Button variant="outline" size="icon" aria-label="Поделиться">
                <ShareIcon aria-hidden />
              </Button>
            </Specimen>
            <Specimen label="icon-sm">
              <Button variant="ghost" size="icon-sm" aria-label="Изменить">
                <PencilIcon aria-hidden />
              </Button>
            </Specimen>
          </Specimens>
        </SpecimenGroup>

        <SpecimenGroup
          title="Длинная подпись"
          note="Текст переносится, кнопка растёт по высоте и не вылезает за лист."
        >
          <div className="max-w-64">
            <Button className="w-full">
              Перевести остаток в&nbsp;общий фонд приюта
            </Button>
          </div>
        </SpecimenGroup>
      </Paper>
    </Section>
  );
}
