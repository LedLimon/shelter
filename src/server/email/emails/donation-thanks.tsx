import { z } from "zod";
import { formatDate } from "@/lib/dates";
import { formatRub, MAX_AMOUNT_KOP } from "@/lib/money";
import { formatCount, type PluralForms } from "@/lib/plural";
import {
  Button,
  Caption,
  Form,
  Link,
  Text,
  Title,
  type FormRow,
} from "../components";
import { defineEmail, type EmailTemplateProps } from "../definition";
import { EmailLayout } from "../layout";
import { FONT } from "../theme";
import { NBSP } from "../typography";

const DONATIONS: PluralForms = [
  "пожертвование",
  "пожертвования",
  "пожертвований",
];

const props = z
  .object({
    /** Donation.id: the number a donor names to support. */
    donationId: z.string().min(1).max(64),
    amountKop: z.number().int().positive().max(MAX_AMOUNT_KOP),
    paidAt: z.date(),
    purpose: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("general") }),
      z.object({
        kind: z.literal("need"),
        title: z.string().trim().min(1).max(300),
        slug: z.string().min(1).max(200),
        /**
         * Donation.overflowKop: the part that went to the general fund —
         * what was above the rest of the goal, or the whole amount if the
         * need had stopped collecting by the time the payment came.
         */
        overflowKop: z.number().int().min(0),
        /** This donation brought the need to its goal. */
        goalReached: z.boolean().default(false),
        /** Paid donations to the need, this one included. */
        donationsCount: z.number().int().positive().optional(),
      }),
    ]),
  })
  .refine(
    ({ amountKop, purpose }) =>
      purpose.kind !== "need" || purpose.overflowKop <= amountKop,
    { path: ["purpose", "overflowKop"], error: "exceeds amountKop" },
  );

type Props = z.output<typeof props>;

/** How the money was split, in the words of the letter. */
type Story =
  | { kind: "general" }
  | { kind: "need"; title: string; url: string; count?: number; goal: boolean }
  | {
      kind: "split";
      title: string;
      url: string;
      toNeedKop: number;
      overflowKop: number;
    }
  | { kind: "closed"; title: string; url: string };

function storyOf({ amountKop, purpose }: Props, siteUrl: string): Story {
  if (purpose.kind === "general") return { kind: "general" };
  const { title, overflowKop } = purpose;
  const url = `${siteUrl}/needs/${encodeURIComponent(purpose.slug)}`;
  if (overflowKop === 0) {
    return {
      kind: "need",
      title,
      url,
      count: purpose.donationsCount,
      goal: purpose.goalReached,
    };
  }
  if (overflowKop === amountKop) return { kind: "closed", title, url };
  return {
    kind: "split",
    title,
    url,
    toNeedKop: amountKop - overflowKop,
    overflowKop,
  };
}

function subject({ amountKop }: Props): string {
  return `Спасибо! Мы получили ваше пожертвование — ${formatRub(amountKop)}`;
}

function previewOf(story: Story): string {
  switch (story.kind) {
    case "general":
      return "Оно зачислено в общий фонд приюта.";
    case "need":
      return `Вся сумма пошла на сбор «${story.title}».`;
    case "split":
      return `${formatRub(story.toNeedKop)} — на сбор «${story.title}», ${formatRub(story.overflowKop)} — в общий фонд приюта.`;
    case "closed":
      return `Сбор «${story.title}» уже закрыт, поэтому сумма перешла в общий фонд приюта.`;
  }
}

function DonationThanks({ props, context, links }: EmailTemplateProps<Props>) {
  const { siteUrl, shelter, timeZone } = context;
  const story = storyOf(props, siteUrl);
  const ledgerUrl = `${siteUrl}/transparency/ledger`;

  const rows: FormRow[] = [
    { label: "Сумма", value: formatRub(props.amountKop), primary: true },
  ];
  if (story.kind === "split") {
    rows.push(
      { label: "На этот сбор", value: formatRub(story.toNeedKop) },
      { label: "В общий фонд", value: formatRub(story.overflowKop) },
    );
  } else {
    rows.push({
      label: "Куда",
      value: story.kind === "need" ? `Сбор «${story.title}»` : "Общий фонд",
    });
  }
  rows.push({
    label: "Когда",
    value: formatDate(props.paidAt, { timeZone, year: "always" }),
  });

  const generalFund = (
    <Text>
      Общий фонд — это деньги на повседневные расходы приюта, на срочные случаи
      и на то, чтобы добавить, если какому-то сбору не хватило. Каждое
      поступление и каждый расход записаны в{NBSP}
      <Link href={ledgerUrl}>книге операций</Link> на сайте.
    </Text>
  );

  return (
    <EmailLayout
      context={context}
      title={subject(props)}
      preview={previewOf(story)}
      links={links}
      reason={
        `Вы получили это письмо, потому что сделали пожертвование на сайте приюта «${shelter.name}».` +
        (shelter.email ? " Если это были не вы, ответьте на это письмо." : "")
      }
    >
      <Title>Спасибо за помощь!</Title>

      {story.kind === "general" ? (
        <Text>
          Мы получили ваше пожертвование. Оно зачислено в общий фонд приюта.
        </Text>
      ) : null}
      {story.kind === "need" ? (
        <Text>
          Мы получили ваше пожертвование. Вся сумма пошла на сбор{" "}
          <Link href={story.url}>«{story.title}»</Link>.
          {story.goal ? " Оно закрыло сбор: нужная сумма собрана." : null}
        </Text>
      ) : null}
      {story.kind === "split" ? (
        <Text>
          Мы получили ваше пожертвование. Оно закрыло сбор{" "}
          <Link href={story.url}>«{story.title}»</Link>: нужная сумма собрана.
        </Text>
      ) : null}
      {story.kind === "closed" ? (
        <Text>
          Мы получили ваше пожертвование. Пока шла оплата, сбор{" "}
          <Link href={story.url}>«{story.title}»</Link> закрылся, поэтому вся
          сумма перешла в общий фонд приюта.
        </Text>
      ) : null}

      <Form rows={rows} />

      {story.kind === "need" ? (
        <Text>
          {story.count === 1
            ? "Ваше пожертвование — первое в этом сборе. "
            : null}
          {story.count !== undefined && story.count > 1
            ? `Вместе с вашим в этом сборе уже ${formatCount(story.count, DONATIONS)}. `
            : null}
          Когда всё будет куплено, на странице сбора появится отчёт с чеками и
          фото.
        </Text>
      ) : null}
      {story.kind === "split" ? (
        <Text>
          До цели сбору не хватало {formatRub(story.toNeedKop)}, поэтому
          остальные {formatRub(story.overflowKop)} перешли в общий фонд приюта.
        </Text>
      ) : null}
      {story.kind === "need" ? null : generalFund}

      {story.kind === "need" || story.kind === "split" ? (
        <Button href={story.url}>Посмотреть сбор</Button>
      ) : (
        <Button href={`${siteUrl}/transparency`}>Посмотреть расходы</Button>
      )}

      <Caption>
        Это письмо — подтверждение пожертвования, а не кассовый чек. Номер
        пожертвования:{" "}
        <span
          style={{
            // Moves to a line of its own rather than break in the middle.
            display: "inline-block",
            fontFamily: FONT.mono,
            fontSize: 13,
            wordBreak: "break-all",
          }}
        >
          {props.donationId}
        </span>{" "}
        — назовите его, если будете писать нам об этом платеже.
      </Caption>
      <Text style={{ margin: 0 }}>Команда приюта «{shelter.name}»</Text>
    </EmailLayout>
  );
}

const paidAt = new Date("2026-10-11T15:42:00Z");

/** The thanks a donor gets once the payment is confirmed (PAY-3). */
export const donationThanks = defineEmail({
  props,
  subject,
  Template: DonationThanks,
  examples: {
    need: {
      label: "На нужду, вся сумма",
      props: {
        donationId: "cm2a8k3xw0001qz0h7v5t9e4b",
        amountKop: 150_000,
        paidAt,
        purpose: {
          kind: "need",
          title: "Корм на октябрь",
          slug: "korm-na-oktyabr",
          overflowKop: 0,
          donationsCount: 12,
        },
      },
    },
    split: {
      label: "На нужду с переплатой",
      props: {
        donationId: "cm2a8k3xw0002qz0h1c8m6r2d",
        amountKop: 300_000,
        paidAt,
        purpose: {
          kind: "need",
          title: "Противопаразитарная обработка всех собак перед зимой",
          slug: "obrabotka-pered-zimoy",
          overflowKop: 87_550,
          goalReached: true,
        },
      },
    },
    closed: {
      label: "Нужда закрылась, пока шла оплата",
      props: {
        donationId: "cm2a8k3xw0003qz0h4n7p2s9f",
        amountKop: 50_000,
        paidAt,
        purpose: {
          kind: "need",
          title: "Ремонт забора у вольеров",
          slug: "remont-zabora",
          overflowKop: 50_000,
        },
      },
    },
    general: {
      label: "В общий фонд",
      props: {
        donationId: "cm2a8k3xw0004qz0h9j3w5x1g",
        amountKop: 100_000,
        paidAt,
        purpose: { kind: "general" },
      },
    },
  },
});
