import { LegalSheet, LegalShell } from "@/components/legal/legal-shell";

export default function LegalNotFound() {
  return (
    <LegalShell>
      <title>Документ не найден</title>
      <LegalSheet className="grid gap-4">
        <h1 className="text-section">Такого документа нет</h1>
        <p className="max-w-prose">
          Возможно, ссылка устарела или в&nbsp;адресе опечатка. Все документы
          приюта — в&nbsp;списке ниже.
        </p>
      </LegalSheet>
    </LegalShell>
  );
}
