import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

import type { PreviewState } from "../pseudo-states";
import {
  Paper,
  Section,
  Specimen,
  SpecimenGroup,
  Specimens,
} from "../showcase";

const CHECKBOX_STATES: {
  id: string;
  label: string;
  checked?: boolean;
  indeterminate?: boolean;
  preview?: PreviewState;
  disabled?: boolean;
}[] = [
  { id: "cb-off", label: "не отмечен" },
  { id: "cb-on", label: "отмечен", checked: true },
  { id: "cb-mixed", label: "частично", indeterminate: true },
  { id: "cb-hover", label: "наведение", preview: "hover" },
  { id: "cb-focus", label: "фокус", preview: "focus-visible", checked: true },
  { id: "cb-disabled", label: "недоступен", disabled: true },
  {
    id: "cb-disabled-on",
    label: "недоступен, отмечен",
    disabled: true,
    checked: true,
  },
];

const SWITCH_STATES: {
  id: string;
  label: string;
  checked?: boolean;
  preview?: PreviewState;
  disabled?: boolean;
  size?: "sm" | "default";
}[] = [
  { id: "sw-off", label: "выключен" },
  { id: "sw-on", label: "включён", checked: true },
  { id: "sw-hover", label: "наведение", preview: "hover" },
  { id: "sw-focus", label: "фокус", preview: "focus-visible", checked: true },
  { id: "sw-disabled", label: "недоступен", disabled: true },
  {
    id: "sw-disabled-on",
    label: "недоступен, включён",
    disabled: true,
    checked: true,
  },
  { id: "sw-sm", label: "size=sm", size: "sm", checked: true },
];

export function ChoicesSection() {
  return (
    <Section
      id="choices"
      title="Выбор"
      description={
        <>
          Отметки на&nbsp;бланке ставят ручкой: галочка и&nbsp;точка — синие,
          клетка не&nbsp;заливается. Переключатель — как выбранный пункт
          переключателя темы: заливка тонером и&nbsp;сдвиг бегунка. Подписи
          рядом с&nbsp;отметкой — обычным текстом (
          <code className="font-mono text-mono">
            variant=&quot;option&quot;
          </code>
          ), а&nbsp;не&nbsp;капсом.
        </>
      }
    >
      <Paper>
        <SpecimenGroup title="Checkbox">
          <Specimens>
            {CHECKBOX_STATES.map(
              ({ id, label, checked, indeterminate, preview, disabled }) => (
                <Specimen key={id} label={label}>
                  <Checkbox
                    aria-label={`Пример: ${label}`}
                    defaultChecked={checked}
                    indeterminate={indeterminate}
                    disabled={disabled}
                    data-preview={preview}
                  />
                </Specimen>
              ),
            )}
          </Specimens>
          <div className="grid max-w-prose gap-4">
            <Field orientation="horizontal">
              <Checkbox id="cb-receipt" defaultChecked />
              <FieldLabel htmlFor="cb-receipt" variant="option">
                Прислать чек на&nbsp;почту
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="cb-news" />
              <FieldContent>
                <FieldLabel htmlFor="cb-news" variant="option">
                  Рассказывать, на&nbsp;что потратили
                </FieldLabel>
                <FieldDescription>
                  Одно письмо, когда сбор закроется и&nbsp;появится отчёт
                  с&nbsp;чеками.
                </FieldDescription>
              </FieldContent>
            </Field>
            <Field orientation="horizontal" data-invalid>
              <Checkbox
                id="cb-consent"
                aria-invalid
                aria-describedby="cb-consent-error"
              />
              <FieldContent>
                <FieldLabel htmlFor="cb-consent" variant="option">
                  Даю согласие на&nbsp;обработку персональных данных
                </FieldLabel>
                <FieldError id="cb-consent-error">
                  Без согласия на&nbsp;обработку персональных данных
                  мы&nbsp;не&nbsp;сможем принять пожертвование.
                </FieldError>
              </FieldContent>
            </Field>
          </div>
        </SpecimenGroup>

        <SpecimenGroup title="RadioGroup">
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
            <FieldSet>
              <FieldLegend>Как связаться</FieldLegend>
              <RadioGroup defaultValue="telegram">
                {[
                  ["telegram", "Telegram"],
                  ["phone", "Позвонить"],
                  ["max", "MAX"],
                ].map(([value, label]) => (
                  <Field key={value} orientation="horizontal">
                    <RadioGroupItem value={value} id={`radio-${value}`} />
                    <FieldLabel htmlFor={`radio-${value}`} variant="option">
                      {label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Как часто</FieldLegend>
              <RadioGroup aria-invalid aria-describedby="radio-error">
                {[
                  ["once", "Один раз"],
                  ["monthly", "Каждый месяц"],
                ].map(([value, label]) => (
                  <Field key={value} orientation="horizontal">
                    <RadioGroupItem
                      value={value}
                      id={`radio-${value}`}
                      aria-invalid
                    />
                    <FieldLabel htmlFor={`radio-${value}`} variant="option">
                      {label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <FieldError id="radio-error">
                Выберите, как часто помогать.
              </FieldError>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Состояния</FieldLegend>
              <Specimens>
                <Specimen label="наведение">
                  <RadioGroup aria-label="Пример: наведение">
                    <RadioGroupItem
                      value="a"
                      aria-label="Пример: наведение"
                      data-preview="hover"
                    />
                  </RadioGroup>
                </Specimen>
                <Specimen label="фокус">
                  <RadioGroup aria-label="Пример: фокус" defaultValue="a">
                    <RadioGroupItem
                      value="a"
                      aria-label="Пример: фокус"
                      data-preview="focus-visible"
                    />
                  </RadioGroup>
                </Specimen>
                <Specimen label="недоступна">
                  <RadioGroup
                    aria-label="Пример: недоступна"
                    defaultValue="a"
                    disabled
                  >
                    <RadioGroupItem value="a" aria-label="Пример: недоступна" />
                  </RadioGroup>
                </Specimen>
              </Specimens>
            </FieldSet>
          </div>
        </SpecimenGroup>

        <SpecimenGroup title="Switch">
          <Specimens>
            {SWITCH_STATES.map(
              ({ id, label, checked, preview, disabled, size }) => (
                <Specimen key={id} label={label}>
                  <Switch
                    aria-label={`Пример: ${label}`}
                    defaultChecked={checked}
                    disabled={disabled}
                    size={size}
                    data-preview={preview}
                  />
                </Specimen>
              ),
            )}
          </Specimens>
          <div className="grid max-w-prose gap-4">
            <Field orientation="horizontal">
              <Switch id="sw-home" defaultChecked />
              <FieldContent>
                <FieldLabel htmlFor="sw-home" variant="option">
                  Показывать на&nbsp;главной
                </FieldLabel>
                <FieldDescription>
                  Нужда попадёт в&nbsp;блок «Срочно нужно».
                </FieldDescription>
              </FieldContent>
            </Field>
          </div>
        </SpecimenGroup>
      </Paper>
    </Section>
  );
}
