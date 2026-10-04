// 阶段时间窗口判断，与后端 utils.IsTimeInRange 语义一致：
// 留空表示不限制，时间解析失败也视为不限制
export const isTimeInRange = (start?: string, end?: string): boolean => {
  const parse = (value?: string): number | null => {
    if (!value) return null;
    const time = new Date(value.replace(" ", "T")).getTime();
    return Number.isNaN(time) ? null : time;
  };

  const now = Date.now();
  const startTime = parse(start);
  const endTime = parse(end);

  if (startTime !== null && now < startTime) return false;
  if (endTime !== null && now > endTime) return false;
  return true;
};
