"use client";

import {
  CopyIcon,
  EllipsisIcon,
  InfoIcon,
  PencilIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatRub } from "@/lib/money";

import {
  Paper,
  Section,
  Specimen,
  SpecimenGroup,
  Specimens,
} from "../showcase";

const AMOUNTS_KOP = [500_00, 1_000_00, 2_500_00];

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="destructive" />}>
        <Trash2Icon aria-hidden />
        Удалить черновик
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить черновик нужды?</DialogTitle>
          <DialogDescription>
            «Утеплить шесть будок к&nbsp;зиме» ещё не&nbsp;опубликована,
            её&nbsp;никто не&nbsp;видел. Восстановить черновик будет нельзя.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Оставить
          </DialogClose>
          <DialogClose
            render={<Button variant="destructive" />}
            onClick={() => toast("Черновик удалён (пример)")}
          >
            Удалить
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DonateSheetDemo() {
  const [amount, setAmount] = useState(AMOUNTS_KOP[1] ?? 0);
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="help" size="lg" />}>
        Помочь Бурану
      </SheetTrigger>
      <SheetContent side="bottom" className="mx-auto max-w-xl">
        <SheetHeader>
          <SheetTitle>Помочь Бурану</SheetTitle>
          <SheetDescription>
            Операция на&nbsp;лапе. Собрано {formatRub(24_650_00)}
            из&nbsp;{formatRub(38_000_00)}.
          </SheetDescription>
        </SheetHeader>
        <div className="px-sheet">
          <FieldSet>
            <FieldLegend>Сумма</FieldLegend>
            <RadioGroup
              value={amount}
              onValueChange={(value) => setAmount(Number(value))}
              className="grid-cols-3 gap-2"
            >
              {AMOUNTS_KOP.map((kop) => (
                <FieldLabel
                  key={kop}
                  htmlFor={`sheet-amount-${kop}`}
                  variant="option"
                >
                  <Field
                    orientation="horizontal"
                    className="flex-col items-start gap-2"
                  >
                    <RadioGroupItem value={kop} id={`sheet-amount-${kop}`} />
                    <span className="font-display text-sum tabular-nums">
                      {formatRub(kop)}
                    </span>
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>
        </div>
        <SheetFooter>
          <SheetClose
            render={<Button variant="help" size="lg" />}
            onClick={() =>
              toast(`Пример: ${formatRub(amount)} — дальше была бы оплата`)
            }
          >
            Помочь — {formatRub(amount)}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function FiltersSheetDemo() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>
        <SlidersHorizontalIcon aria-hidden />
        Фильтры
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Фильтры</SheetTitle>
          <SheetDescription>Ищем собак, которые ждут дом.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-sheet">
          <FieldSet>
            <FieldLegend>Размер</FieldLegend>
            {["Маленькая", "Средняя", "Крупная"].map((label) => (
              <Field key={label} orientation="horizontal">
                <Checkbox id={`filter-${label}`} />
                <FieldLabel htmlFor={`filter-${label}`} variant="option">
                  {label}
                </FieldLabel>
              </Field>
            ))}
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="filter-name">Кличка</FieldLabel>
            <Input id="filter-name" placeholder="Например, Буран" />
          </Field>
        </FieldGroup>
        <SheetFooter>
          <SheetClose render={<Button />}>Показать 12&nbsp;собак</SheetClose>
          <SheetClose render={<Button variant="ghost" />}>Сбросить</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>
        <InfoIcon aria-hidden />
        Как считается остаток
      </PopoverTrigger>
      <PopoverContent>
        <PopoverHeader>
          <PopoverTitle>Остаток — это цель минус собранное</PopoverTitle>
          <PopoverDescription>
            Считаем по&nbsp;проводкам в&nbsp;книге операций, а&nbsp;не
            по&nbsp;цифре из&nbsp;админки. Если собрали больше цели, разница
            уходит в&nbsp;общий фонд.
          </PopoverDescription>
        </PopoverHeader>
        <a href="#overlays" className="text-pen underline">
          Как устроена прозрачность
        </a>
      </PopoverContent>
    </Popover>
  );
}

function MenuDemo() {
  const [status, setStatus] = useState("active");
  const [onHome, setOnHome] = useState(true);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <EllipsisIcon aria-hidden />
        Действия с&nbsp;нуждой
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Нужда №&nbsp;17</DropdownMenuLabel>
          <DropdownMenuItem>
            <PencilIcon aria-hidden />
            Изменить
            <DropdownMenuShortcut>E</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CopyIcon aria-hidden />
            Дублировать
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Статус</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(value) => setStatus(String(value))}
              >
                <DropdownMenuRadioItem value="active">
                  Идёт сбор
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="paused">
                  На паузе
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="closed" disabled>
                  Закрыта
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuCheckboxItem
            checked={onHome}
            onCheckedChange={setOnHome}
          >
            На&nbsp;главной
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2Icon aria-hidden />
          Удалить
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TooltipDemo() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Скопировать ссылку"
          />
        }
        onClick={() => toast.success("Ссылка скопирована (пример)")}
      >
        <CopyIcon aria-hidden />
      </TooltipTrigger>
      <TooltipContent>Скопировать ссылку на&nbsp;нужду</TooltipContent>
    </Tooltip>
  );
}

export function OverlaysSection() {
  return (
    <Section
      id="overlays"
      title="Слои"
      description={
        <>
          Диалог и&nbsp;шторка — лист бумаги над затемнённой доской (
          <code className="font-mono text-mono">bg-scrim/40</code>, без
          размытия); всплывающие меню, подсказки и&nbsp;поповеры — листки
          в&nbsp;рамке тонера. Esc закрывает любой слой, фокус возвращается
          на&nbsp;кнопку, которая его открыла.
        </>
      }
    >
      <TooltipProvider>
        <Paper>
          <SpecimenGroup
            title="Dialog"
            note="Только когда нужно прервать: подтверждение необратимого действия, форма с удержанием фокуса."
          >
            <Specimens>
              <Specimen label="подтверждение">
                <DialogDemo />
              </Specimen>
            </Specimens>
          </SpecimenGroup>
          <SpecimenGroup
            title="Sheet"
            note="Снизу — шторка доната на мобильном (DonateSheet в DS-3), сбоку — фильтры каталога."
          >
            <Specimens>
              <Specimen label='side="bottom"'>
                <DonateSheetDemo />
              </Specimen>
              <Specimen label='side="right"'>
                <FiltersSheetDemo />
              </Specimen>
            </Specimens>
          </SpecimenGroup>
          <SpecimenGroup title="Popover, DropdownMenu, Tooltip">
            <Specimens>
              <Specimen label="Popover">
                <PopoverDemo />
              </Specimen>
              <Specimen label="DropdownMenu">
                <MenuDemo />
              </Specimen>
              <Specimen label="Tooltip">
                <TooltipDemo />
              </Specimen>
            </Specimens>
            <p className="max-w-prose text-caption text-toner-muted">
              Подсказка появляется при наведении и&nbsp;фокусе, на&nbsp;телефоне
              её&nbsp;не&nbsp;видно — важное в&nbsp;неё не&nbsp;кладём.
            </p>
          </SpecimenGroup>
        </Paper>
      </TooltipProvider>
    </Section>
  );
}
