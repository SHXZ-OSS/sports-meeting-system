import type {
  CompetitionCustomField,
  CustomFieldType,
  RegistrationCustomValue,
} from "../types";

const TYPE_LABELS: Record<CustomFieldType, string> = {
  string: "文本",
  int: "整数",
  float: "小数",
  bool: "布尔",
};

const LABEL_TYPES: Record<string, CustomFieldType> = {
  文本: "string",
  整数: "int",
  小数: "float",
  布尔: "bool",
  string: "string",
  int: "int",
  float: "float",
  bool: "bool",
};

export const CUSTOM_FIELD_TYPE_OPTIONS = (
  Object.keys(TYPE_LABELS) as CustomFieldType[]
).map((value) => ({ value, label: TYPE_LABELS[value] }));

export const customFieldTypeLabel = (type: CustomFieldType): string =>
  TYPE_LABELS[type] ?? type;

/** 解析 Excel 中的字段定义：体重|小数|必填;鞋码|整数|选填 */
export const parseCustomFieldSpec = (
  spec: unknown,
): CompetitionCustomField[] => {
  if (typeof spec !== "string" || !spec.trim()) {
    return [];
  }

  return spec
    .split(/[;；]/)
    .filter((segment) => segment.trim() !== "")
    .map((segment, index) => {
      const parts = segment.split("|").map((part) => part.trim());
      if (parts.length < 2) {
        throw new Error(`自定义字段格式错误：${segment}`);
      }
      const [name, typeText, requiredText = "选填"] = parts;
      const fieldType = LABEL_TYPES[typeText];
      if (!name) {
        throw new Error("自定义字段名称不能为空");
      }
      if (!fieldType) {
        throw new Error(`未知的自定义字段类型：${typeText}`);
      }
      return {
        id: 0,
        name,
        field_type: fieldType,
        required:
          requiredText === "必填" ||
          requiredText === "是" ||
          requiredText.toLowerCase() === "true",
        sort_order: index,
      };
    });
};

/** 序列化为 Excel 字段定义 */
export const serializeCustomFieldSpec = (
  fields?: CompetitionCustomField[],
): string => {
  if (!fields || fields.length === 0) {
    return "";
  }
  return [...fields]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(
      (field) =>
        `${field.name}|${customFieldTypeLabel(field.field_type)}|${
          field.required ? "必填" : "选填"
        }`,
    )
    .join(";");
};

/** 展示报名值 */
export const formatCustomFieldValue = (
  field: CompetitionCustomField,
  value?: string,
): string => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (field.field_type === "bool") {
    return value === "true" ? "是" : "否";
  }
  return value;
};

/** 从报名记录中取值 */
export const getCustomFieldValue = (
  values: RegistrationCustomValue[] | undefined,
  fieldId: number,
): string | undefined =>
  values?.find((value) => value.field_id === fieldId)?.value;

/** 校验必填字段，返回缺失字段 */
export const getMissingRequiredFields = (
  fields: CompetitionCustomField[] | undefined,
  values: Record<number, string | number | boolean | undefined>,
): CompetitionCustomField[] =>
  (fields ?? []).filter(
    (field) =>
      field.required &&
      (values[field.id] === undefined || values[field.id] === ""),
  );
