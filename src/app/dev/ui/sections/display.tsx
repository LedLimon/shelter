import { CircleXIcon, ClockIcon, HouseIcon, PawPrintIcon } from "lucide-react";

import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatRub } from "@/lib/money";

import {
  Paper,
  Section,
  Specimen,
  SpecimenGroup,
  Specimens,
} from "../showcase";

export function CardsSection() {
  return (
    <Section
      id="cards"
      title="Карточки"
      description={
        <>
          <code className="font-mono text-mono">Card</code> — лист бумаги
          на&nbsp;доске: одна тень, без рамки и&nbsp;скруглений. Карточки лежат
          прямо на&nbsp;доске и&nbsp;не&nbsp;вкладываются в&nbsp;другие листы.
          Доменные карточки (NeedCard, DogCard) собирает DS-3.
        </>
      }
    >
      <div className="grid items-start gap-grid md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Отчёт за&nbsp;сентябрь</CardTitle>
            <CardDescription>Опубликован 3&nbsp;октября</CardDescription>
            <CardAction>
              <Badge variant="outline">Новый</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p>
              Собрали {formatRub(182_400_00)}, потратили {formatRub(167_950_00)}
              на&nbsp;корм, прививки и&nbsp;ремонт вольеров. Все чеки
              в&nbsp;отчёте.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline">Открыть отчёт</Button>
          </CardFooter>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Общий фонд</CardTitle>
            <CardDescription>
              size=&quot;sm&quot;: плотнее, для админки
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-display text-sum-lg tabular-nums">
              {formatRub(48_210_00)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              Противопаразитарная обработка всех собак перед зимой
            </CardTitle>
            <CardDescription>Длинный заголовок переносится</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-caption text-toner-muted">
              Заголовки — в&nbsp;обычном регистре, длинные слова переносятся
              по&nbsp;слогам.
            </p>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

export function MarksSection() {
  return (
    <Section
      id="marks"
      title="Метки"
      description={
        <>
          <code className="font-mono text-mono">Badge</code>,{" "}
          <code className="font-mono text-mono">Avatar</code>,{" "}
          <code className="font-mono text-mono">Separator</code>. Бейджи —
          плашка или&nbsp;рамка с&nbsp;коротким словом капсом, не&nbsp;серые
          «пилюли»; статус — всегда иконка и&nbsp;слово. Срочность — отдельный
          UrgencyBadge (DS-3) на&nbsp;утилитах{" "}
          <code className="font-mono text-mono">urgency-*</code>.
        </>
      }
    >
      <Paper>
        <SpecimenGroup title="Badge">
          <Specimens>
            <Specimen label="default">
              <Badge>
                <HouseIcon aria-hidden data-icon="inline-start" />
                Дома
              </Badge>
            </Specimen>
            <Specimen label="outline">
              <Badge variant="outline">
                <PawPrintIcon aria-hidden data-icon="inline-start" />
                Ищет дом
              </Badge>
            </Specimen>
            <Specimen label="secondary">
              <Badge variant="secondary">
                <ClockIcon aria-hidden data-icon="inline-start" />
                Черновик
              </Badge>
            </Specimen>
            <Specimen label="destructive">
              <Badge variant="destructive">
                <CircleXIcon aria-hidden data-icon="inline-start" />
                Отменена
              </Badge>
            </Specimen>
            <Specimen label="ghost">
              <Badge variant="ghost">Корм</Badge>
            </Specimen>
            <Specimen label="link · наведение">
              <Badge
                variant="link"
                data-preview="hover"
                render={<a href="#marks" />}
              >
                Все отчёты
              </Badge>
            </Specimen>
            <Specimen label="ссылка · фокус">
              <Badge
                variant="outline"
                data-preview="focus-visible"
                render={<a href="#marks" />}
              >
                Корм
              </Badge>
            </Specimen>
          </Specimens>
        </SpecimenGroup>

        <SpecimenGroup
          title="Avatar"
          note="Квадратное «напечатанное» фото в рамке тонера; без фото — инициалы. Если картинка не загрузилась, показываются инициалы."
        >
          <Specimens className="items-end">
            <Specimen label="sm · инициалы">
              <Avatar size="sm">
                <AvatarFallback>АК</AvatarFallback>
              </Avatar>
            </Specimen>
            <Specimen label="default · фото">
              <Avatar>
                <AvatarImage src="/icon.svg" alt="Куратор Анна" />
                <AvatarFallback>АН</AvatarFallback>
              </Avatar>
            </Specimen>
            <Specimen label="lg · не загрузилось">
              <Avatar size="lg">
                {/* An image that fails to decode, without a 404 in the console. */}
                <AvatarImage
                  src="data:image/png;base64,"
                  alt="Куратор Сергей"
                />
                <AvatarFallback>СМ</AvatarFallback>
              </Avatar>
            </Specimen>
            <Specimen label="со значком">
              <Avatar>
                <AvatarFallback>ОЛ</AvatarFallback>
                <AvatarBadge>
                  <span className="sr-only">На смене</span>
                </AvatarBadge>
              </Avatar>
            </Specimen>
            <Specimen label="группа">
              <AvatarGroup>
                <Avatar>
                  <AvatarFallback>АК</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>ИП</AvatarFallback>
                </Avatar>
                <Avatar>
                  <AvatarFallback>ЮС</AvatarFallback>
                </Avatar>
                <AvatarGroupCount>+4</AvatarGroupCount>
              </AvatarGroup>
            </Specimen>
          </Specimens>
        </SpecimenGroup>

        <SpecimenGroup title="Separator">
          <div className="grid max-w-prose gap-4">
            <p className="text-caption">Поступления за&nbsp;октябрь</p>
            <Separator />
            <div className="flex h-6 items-center gap-4 text-caption">
              <span>Корм</span>
              <Separator orientation="vertical" />
              <span>Лекарства</span>
              <Separator orientation="vertical" />
              <span>Ремонт</span>
            </div>
          </div>
        </SpecimenGroup>
      </Paper>
    </Section>
  );
}

export function TabsSection() {
  return (
    <Section
      id="tabs"
      title="Вкладки"
      description={
        <>
          <code className="font-mono text-mono">Tabs</code>: по&nbsp;умолчанию —
          полоса в&nbsp;рамке тонера, как переключатель темы; вариант{" "}
          <code className="font-mono text-mono">line</code> — слова
          с&nbsp;подчёркиванием. Стрелки переключают вкладки, Tab уходит
          в&nbsp;панель.
        </>
      }
    >
      <Paper>
        <SpecimenGroup title='variant="default"'>
          <Tabs defaultValue="needs">
            <TabsList>
              <TabsTrigger value="needs">Нужды</TabsTrigger>
              <TabsTrigger value="dogs">Собаки</TabsTrigger>
              <TabsTrigger value="reports">Отчёты</TabsTrigger>
              <TabsTrigger value="archive" disabled>
                Архив
              </TabsTrigger>
            </TabsList>
            <TabsContent value="needs">
              Пять открытых нужд: две срочные, три обычные.
            </TabsContent>
            <TabsContent value="dogs">23&nbsp;собаки ждут дом.</TabsContent>
            <TabsContent value="reports">
              Отчёты публикуются в&nbsp;начале месяца.
            </TabsContent>
          </Tabs>
        </SpecimenGroup>
        <SpecimenGroup title='variant="line"'>
          <Tabs defaultValue="incoming">
            <TabsList variant="line">
              <TabsTrigger value="incoming">Поступления</TabsTrigger>
              <TabsTrigger value="outgoing">Расходы</TabsTrigger>
              <TabsTrigger value="receipts">Чеки</TabsTrigger>
            </TabsList>
            <TabsContent value="incoming">
              Каждое пожертвование — строка в&nbsp;книге операций.
            </TabsContent>
            <TabsContent value="outgoing">
              Расходы с&nbsp;чеками и&nbsp;фото результата.
            </TabsContent>
            <TabsContent value="receipts">
              Персональные данные на&nbsp;чеках закрашены.
            </TabsContent>
          </Tabs>
        </SpecimenGroup>
        <SpecimenGroup
          title="Состояния"
          note="Слева направо: выбрана, наведение, фокус, недоступна."
        >
          {(["default", "line"] as const).map((variant) => (
            <Tabs
              key={variant}
              defaultValue="a"
              aria-label={`Пример: ${variant}`}
            >
              <TabsList variant={variant}>
                <TabsTrigger value="a">Выбрана</TabsTrigger>
                <TabsTrigger value="b" data-preview="hover">
                  Наведение
                </TabsTrigger>
                <TabsTrigger value="c" data-preview="focus-visible">
                  Фокус
                </TabsTrigger>
                <TabsTrigger value="d" disabled>
                  Недоступна
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ))}
        </SpecimenGroup>
      </Paper>
    </Section>
  );
}
