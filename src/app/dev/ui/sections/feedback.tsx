"use client";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatRub } from "@/lib/money";

import { Paper, Section, SpecimenGroup, Specimens } from "../showcase";

const TOASTS: { label: string; show: () => void }[] = [
  {
    label: "Успех",
    show: () =>
      toast.success("Нужда опубликована", {
        description: "Она появится на главной в течение минуты.",
      }),
  },
  {
    label: "Ошибка",
    show: () =>
      toast.error("Платёж не прошёл", {
        description: "Попробуйте другую карту или СБП.",
      }),
  },
  {
    label: "Предупреждение",
    show: () =>
      toast.warning("Сбор почти закрыт", {
        description: `Осталось ${formatRub(350_00)} — лишнее уйдёт в общий фонд.`,
      }),
  },
  {
    label: "Инфо",
    show: () => toast.info("Чек придёт на почту в течение часа"),
  },
  {
    label: "С действием",
    show: () =>
      toast("Расход удалён", {
        action: { label: "Вернуть", onClick: () => toast("Расход вернули") },
      }),
  },
  {
    label: "Загрузка",
    show: () => {
      toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
        loading: "Загружаем чек…",
        success: "Чек загружен",
        error: "Не удалось загрузить чек",
      });
    },
  },
];

/** A NeedCard-shaped placeholder: photo 4:3, title, progress box, tabs. */
function NeedCardSkeleton() {
  return (
    <div
      aria-busy
      className="grid w-full max-w-80 gap-3 rounded-sheet bg-paper p-card shadow-sheet"
    >
      <span className="sr-only">Загружаем нужду…</span>
      <Skeleton className="aspect-[4/3] w-full" />
      <Skeleton className="h-4 w-24" />
      <div className="grid gap-1.5">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-2/3" />
      </div>
      <Skeleton className="h-[1.125rem] w-full" />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-tab" />
        <Skeleton className="h-tab" />
        <Skeleton className="h-tab" />
      </div>
    </div>
  );
}

export function FeedbackSection() {
  return (
    <Section
      id="feedback"
      title="Уведомления и загрузка"
      description={
        <>
          Тосты (<code className="font-mono text-mono">sonner</code>) — листки
          в&nbsp;рамке тонера; состояние передают иконка и&nbsp;слово, чернила
          окрашивают только иконку. Загрузка контента — скелетон по&nbsp;форме
          контента, спиннер — только внутри кнопки или строки.
        </>
      }
    >
      <Paper>
        <SpecimenGroup
          title="Toast"
          note="Нажмите — тост появится внизу справа (на телефоне — внизу во всю ширину). Alt+T переводит фокус в уведомления."
        >
          <Specimens>
            {TOASTS.map(({ label, show }) => (
              <Button key={label} variant="outline" onClick={show}>
                {label}
              </Button>
            ))}
          </Specimens>
        </SpecimenGroup>
        <SpecimenGroup
          title="Spinner"
          note="Внутри кнопки (loading) или строки, всегда со словом: при reduced motion он не крутится."
        >
          <p className="flex items-center gap-2 text-caption text-toner-muted">
            <Spinner aria-hidden />
            Загружаем чеки…
          </p>
        </SpecimenGroup>
      </Paper>
      <div className="grid justify-items-start gap-2">
        <NeedCardSkeleton />
        <p className="font-mono text-mono-sm text-toner-muted">
          Skeleton по форме NeedCard — лежит на доске, как сама карточка
        </p>
      </div>
    </Section>
  );
}
