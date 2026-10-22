import React from "react";
import { Input, InputNumber, Select } from "antd";
import type { CompetitionCustomField } from "../types";

export type CustomFieldValueMap = Record<
  number,
  string | number | boolean | undefined
>;

interface CustomFieldInputsProps {
  fields?: CompetitionCustomField[];
  values: CustomFieldValueMap;
  onChange: (values: CustomFieldValueMap) => void;
  disabled?: boolean;
}

const CustomFieldInputs: React.FC<CustomFieldInputsProps> = ({
  fields = [],
  values,
  onChange,
  disabled,
}) => {
  if (fields.length === 0) {
    return null;
  }

  const setValue = (
    fieldId: number,
    value: string | number | boolean | undefined,
  ) => {
    onChange({ ...values, [fieldId]: value });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[...fields]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((field) => {
          const value = values[field.id];
          return (
            <div key={field.id}>
              <div style={{ marginBottom: 4 }}>
                {field.name}
                {field.required && (
                  <span style={{ color: "#ff4d4f", marginLeft: 4 }}>*</span>
                )}
              </div>

              {field.field_type === "string" && (
                <Input
                  disabled={disabled}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => setValue(field.id, event.target.value)}
                />
              )}

              {field.field_type === "int" && (
                <InputNumber
                  precision={0}
                  disabled={disabled}
                  style={{ width: "100%" }}
                  value={typeof value === "number" ? value : undefined}
                  onChange={(next) => setValue(field.id, next ?? undefined)}
                />
              )}

              {field.field_type === "float" && (
                <InputNumber
                  step={0.1}
                  disabled={disabled}
                  style={{ width: "100%" }}
                  value={typeof value === "number" ? value : undefined}
                  onChange={(next) => setValue(field.id, next ?? undefined)}
                />
              )}

              {field.field_type === "bool" && (
                <Select
                  disabled={disabled}
                  style={{ width: "100%" }}
                  placeholder="请选择"
                  value={typeof value === "string" ? value : undefined}
                  onChange={(next) => setValue(field.id, next)}
                  options={[
                    { label: "是", value: "true" },
                    { label: "否", value: "false" },
                  ]}
                />
              )}
            </div>
          );
        })}
    </div>
  );
};

export default CustomFieldInputs;
