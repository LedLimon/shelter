import type { CSSProperties } from "react";

import { adminTextFace } from "@/app/admin/fonts";
import {
  pageOf,
  parseTableQuery,
} from "@/components/admin/data-table/table-query";

import { Paper, Section, SpecimenGroup } from "../../showcase";
import { findOperations, OPERATIONS_TABLE } from "./operations";
import { EmptyOperationsTable, OperationsTable } from "./operations-table";

/**
 * DataTable as an admin list page uses it: the state comes from the URL, the
 * "database" is filtered, sorted and cut into pages here, on the server.
 */
export function DataTableSection({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseTableQuery(searchParams, OPERATIONS_TABLE);
  const found = findOperations(query);
  const { skip, take } = pageOf(query, found.length);

  return (
    <Section
      id="data-table"
      title="Таблица"
      description={
        <>
          <code className="font-mono text-mono">DataTable</code> админки
          на&nbsp;TanStack Table. Сортировку, поиск, фильтры и&nbsp;страницы
          делает сервер: состояние лежит в&nbsp;адресе страницы, таблицей можно
          поделиться ссылкой. Текст — Sofia Sans, как во&nbsp;всей админке.
        </>
      }
    >
      {/* The admin's text face, set the way src/app/admin/layout.tsx sets it. */}
      <div
        className="font-body"
        style={{ "--font-face-text": adminTextFace } as CSSProperties}
      >
        <Paper>
          <SpecimenGroup
            title="Список с поиском, фильтром и страницами"
            note="Заголовки «Дата», «Операция» и «Сумма» сортируют. На телефоне таблица прокручивается вбок внутри листа."
          >
            <OperationsTable
              rows={found.slice(skip, skip + take)}
              total={found.length}
              query={query}
            />
          </SpecimenGroup>
          <SpecimenGroup title="Пустой список: что случилось и что сделать">
            <EmptyOperationsTable
              query={parseTableQuery({}, OPERATIONS_TABLE)}
            />
          </SpecimenGroup>
        </Paper>
      </div>
    </Section>
  );
}
