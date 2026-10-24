/**
 * 中文排序工具函数
 * 支持中文数字和阿拉伯数字混合排序
 */

/**
 * 中文排序函数
 * @param a 第一个字符串
 * @param b 第二个字符串
 * @returns 比较结果 (-1, 0, 1)
 */
export const chineseSort = (a: string, b: string): number => {
  // 中文数字到阿拉伯数字的映射
  const chineseNumMap: { [key: string]: number } = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };

  // 使用正则表达式分割字符串为文本和数字部分
  const splitParts = (str: string): (string | number)[] => {
    // 匹配：阿拉伯数字 或 单个中文数字 或 其他字符
    const parts: (string | number)[] = [];
    let i = 0;

    while (i < str.length) {
      // 尝试匹配连续的阿拉伯数字
      if (/\d/.test(str[i])) {
        let numStr = "";
        while (i < str.length && /\d/.test(str[i])) {
          numStr += str[i];
          i++;
        }
        parts.push(parseInt(numStr));
      }
      // 尝试匹配单个中文数字
      else if (chineseNumMap[str[i]] !== undefined) {
        parts.push(chineseNumMap[str[i]]);
        i++;
      }
      // 其他字符
      else {
        let textStr = "";
        while (
          i < str.length &&
          !/\d/.test(str[i]) &&
          chineseNumMap[str[i]] === undefined
        ) {
          textStr += str[i];
          i++;
        }
        if (textStr) parts.push(textStr);
      }
    }

    return parts;
  };

  const partsA = splitParts(a);
  const partsB = splitParts(b);

  // 逐部分比较
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const partA = partsA[i];
    const partB = partsB[i];

    // 如果其中一个已经没有部分了
    if (partA === undefined) return -1;
    if (partB === undefined) return 1;

    // 如果都是数字，按数字比较
    if (typeof partA === "number" && typeof partB === "number") {
      if (partA !== partB) return partA - partB;
    }
    // 如果都是字符串，按中文排序
    else if (typeof partA === "string" && typeof partB === "string") {
      const cmp = partA.localeCompare(partB, "zh-CN");
      if (cmp !== 0) return cmp;
    }
    // 如果类型不同，数字排在前面
    else if (typeof partA === "number") {
      return -1;
    } else {
      return 1;
    }
  }

  return 0;
};

/** 按班级、再按姓名拼音排序（报名列表、Excel 导出、检录/录入名单共用） */
export const compareClassThenName = (
  classA: string,
  nameA: string,
  classB: string,
  nameB: string,
): number => {
  const classCompare = chineseSort(classA, classB);
  return classCompare !== 0 ? classCompare : chineseSort(nameA, nameB);
};
