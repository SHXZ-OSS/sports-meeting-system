import { Tag } from "antd";
import { ReactNode } from "react";
import { PERMISSIONS } from "../types";

// 权限项接口
export interface PermissionItem {
  value: number;
  label: string;
  description: string;
}

// 权限选项配置
export const PERMISSION_OPTIONS: PermissionItem[] = [
  {
    value: PERMISSIONS.PROJECT_MANAGEMENT,
    label: "项目管理",
    description: "管理比赛项目、审核等",
  },
  {
    value: PERMISSIONS.USER_MANAGEMENT,
    label: "用户管理",
    description: "管理系统用户账号",
  },
  {
    value: PERMISSIONS.STUDENT_AND_CLASS_MANAGEMENT,
    label: "学生班级管理",
    description: "管理学生和班级信息",
  },
  {
    value: PERMISSIONS.WEBSITE_MANAGEMENT,
    label: "网站管理",
    description: "管理系统设置和网站信息",
  },
  {
    value: PERMISSIONS.SCORE_INPUT,
    label: "成绩录入",
    description: "录入比赛成绩",
  },
  {
    value: PERMISSIONS.SCORE_REVIEW,
    label: "成绩审核",
    description: "审核比赛成绩",
  },
  {
    value: PERMISSIONS.REGISTRATION_MANAGEMENT,
    label: "报名管理",
    description: "管理学生报名信息",
  },
];

// 获取权限标签
export const getPermissionTags = (permissions: number): ReactNode => {
  const tags = PERMISSION_OPTIONS.filter(
    (perm) => (permissions & perm.value) !== 0,
  ).map((perm) => (
    <Tag key={perm.value} color="blue" style={{ marginBottom: 4 }}>
      {perm.label}
    </Tag>
  ));
  return tags.length > 0 ? tags : <Tag color="default">无权限</Tag>;
};

// 计算权限值
export const calculatePermissions = (selectedPermissions: number[]): number => {
  return selectedPermissions.reduce((total, perm) => total | perm, 0);
};

// 获取已选择的权限
export const getSelectedPermissions = (permissions: number): number[] => {
  return PERMISSION_OPTIONS.filter(
    (perm) => (permissions & perm.value) !== 0,
  ).map((perm) => perm.value);
};

// 检查是否有特定权限
export const hasPermission = (
  userPermissions: number,
  permission: number,
): boolean => {
  return (userPermissions & permission) !== 0;
};

// 检查是否有任一权限
export const hasAnyPermission = (
  userPermissions: number,
  permissions: number[],
): boolean => {
  return permissions.some((permission) =>
    hasPermission(userPermissions, permission),
  );
};

// 检查是否有所有权限
export const hasAllPermissions = (
  userPermissions: number,
  permissions: number[],
): boolean => {
  return permissions.every((permission) =>
    hasPermission(userPermissions, permission),
  );
};

// 获取权限名称
export const getPermissionName = (permission: number): string => {
  const permissionItem = PERMISSION_OPTIONS.find(
    (item) => item.value === permission,
  );
  return permissionItem?.label || "未知权限";
};

// 获取权限描述
export const getPermissionDescription = (permission: number): string => {
  const permissionItem = PERMISSION_OPTIONS.find(
    (item) => item.value === permission,
  );
  return permissionItem?.description || "未知权限";
};

// 获取用户所有权限名称
export const getUserPermissionNames = (permissions: number): string[] => {
  return PERMISSION_OPTIONS.filter((perm) =>
    hasPermission(permissions, perm.value),
  ).map((perm) => perm.label);
};
