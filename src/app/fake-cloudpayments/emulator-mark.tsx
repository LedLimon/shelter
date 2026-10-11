import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Says on every screen that this is not a real payment page. */
export function EmulatorMark() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption">
      <Badge variant="outline">
        <FlaskConical aria-hidden />
        Эмулятор
      </Badge>
      <span>CloudPayments. Деньги не&nbsp;списываются.</span>
    </p>
  );
}
