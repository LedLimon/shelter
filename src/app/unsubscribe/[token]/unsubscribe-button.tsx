"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function UnsubscribeButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending}>
      {pending ? "Отписываем…" : "Отписаться"}
    </Button>
  );
}
