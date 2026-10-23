import React from "react";
import { Button, Empty, Input, Select, Space, Switch, Tag } from "antd";
import { DeleteOutlined, LockOutlined, PlusOutlined } from "@ant-design/icons";
import type { CompetitionCustomField, CustomFieldType } from "../types";
import { CUSTOM_FIELD_TYPE_OPTIONS } from "../utils/customFields";

interface CustomFieldsEditorProps {
  value?: CompetitionCustomField[];
  onChange?: (value: CompetitionCustomField[]) => void;
}

const CustomFieldsEditor: React.FC<CustomFieldsEditorProps> = ({
  value = [],
  onChange,
}) => {
  const updateField = (
    index: number,
    patch: Partial<CompetitionCustomField>,
  ) => {
    onChange?.(
      value.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  };

  const addField = () => {
    const maxSortOrder = value.reduce(
      (max, field) => Math.max(max, field.sort_order ?? 0),
      -1,
    );
    onChange?.([
      ...value,
      {
        id: 0,
        name: "",
        field_type: "string",
        required: false,
        sort_order: maxSortOrder + 1,
      },
    ]);
  };

  const removeField = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
        定义报名时需要填写的附加信息。字段一旦有报名数据，
        名称、类型和必填设置将不能修改。
      </div>

      {value.length === 0 && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无自定义字段"
        />
      )}

      {value.map((field, index) => {
        const locked = !!field.has_registration_data;
        return (
          <Space
            key={`${field.id}-${index}`}
            align="start"
            wrap
            style={{ display: "flex", marginBottom: 8 }}
          >
            <Input
              placeholder="字段名称，如：体重"
              value={field.name}
              disabled={locked}
              onChange={(event) =>
                updateField(index, { name: event.target.value })
              }
              style={{ width: 180 }}
            />
            <Select
              value={field.field_type}
              disabled={locked}
              onChange={(fieldType) =>
                updateField(index, { field_type: fieldType as CustomFieldType })
              }
              options={CUSTOM_FIELD_TYPE_OPTIONS}
              style={{ width: 100 }}
            />
            <Space>
              <span style={{ fontSize: 12 }}>必填</span>
              <Switch
                checked={field.required}
                disabled={locked}
                onChange={(checked) =>
                  updateField(index, { required: checked })
                }
              />
            </Space>
            {locked && (
              <Tag icon={<LockOutlined />} color="default">
                已有报名数据
              </Tag>
            )}
            <Button
              danger
              type="text"
              icon={<DeleteOutlined />}
              disabled={locked}
              onClick={() => removeField(index)}
            />
          </Space>
        );
      })}

      <Button type="dashed" icon={<PlusOutlined />} onClick={addField} block>
        添加自定义字段
      </Button>
    </div>
  );
};

export default CustomFieldsEditor;
