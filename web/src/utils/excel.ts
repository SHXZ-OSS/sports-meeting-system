import * as XLSX from "xlsx-js-style";

/**
 * 为所有单元格添加样式（边框和字体）
 */
const addStylesToWorksheet = (ws: XLSX.WorkSheet, data: any[][]) => {
  const borderStyle = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };

  const fontStyle = {
    name: "宋体",
  };

  // 遍历所有数据行和列
  data.forEach((row, rowIndex) => {
    row.forEach((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      if (!ws[cellAddress]) {
        ws[cellAddress] = { t: "s", v: "" }; // 创建空单元格
      }

      // 添加边框和字体样式
      ws[cellAddress].s = {
        ...ws[cellAddress].s,
        border: borderStyle,
        font: fontStyle,
      };
    });
  });
};

/**
 * 合并单元格配置（扩展）
 */
export interface MergeConfig extends XLSX.Range {
  centerAlign?: boolean;
  middleAlign?: boolean;
}

/**
 * 创建合并单元格范围
 * @param startRow 起始行（从0开始）
 * @param startCol 起始列（从0开始）
 * @param endRow 结束行（从0开始）
 * @param endCol 结束列（从0开始）
 * @param centerAlign 水平居中对齐
 * @param middleAlign 垂直居中对齐
 */
export const createMerge = (
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  centerAlign: boolean = false,
  middleAlign: boolean = false,
): MergeConfig => {
  return {
    s: { r: startRow, c: startCol },
    e: { r: endRow, c: endCol },
    centerAlign,
    middleAlign,
  };
};

/**
 * 导出 Excel 文件（支持单个或多个 Sheet）
 */
export const exportExcel = (
  sheets: Array<{
    name: string;
    data: any[][];
    merges?: (XLSX.Range | MergeConfig)[];
    colWidths?: number[];
  }>,
  filename: string,
) => {
  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const safeName = sheet.name
      .replace(/:/g, "：")
      .replace(/\\/g, "＼")
      .replace(/\//g, "／")
      .replace(/\?/g, "？")
      .replace(/\*/g, "＊")
      .replace(/\[/g, "［")
      .replace(/]/g, "］")
      .slice(0, 31);
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);

    // 设置合并单元格
    if (sheet.merges && sheet.merges.length > 0) {
      ws["!merges"] = sheet.merges.map((merge) => ({
        s: merge.s,
        e: merge.e,
      }));

      // 应用合并单元格的对齐样式
      sheet.merges.forEach((merge) => {
        const mergeConfig = merge as MergeConfig;
        if (mergeConfig.centerAlign || mergeConfig.middleAlign) {
          // 为合并区域的所有单元格应用对齐样式
          for (let row = merge.s.r; row <= merge.e.r; row++) {
            for (let col = merge.s.c; col <= merge.e.c; col++) {
              const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
              if (!ws[cellAddress]) {
                ws[cellAddress] = { t: "s", v: "" };
              }
              if (!ws[cellAddress].s) {
                ws[cellAddress].s = {};
              }
              ws[cellAddress].s.alignment = {
                ...(ws[cellAddress].s.alignment || {}),
                ...(mergeConfig.centerAlign && { horizontal: "center" }),
                ...(mergeConfig.middleAlign && { vertical: "center" }),
              };
            }
          }
        }
      });
    }

    // 设置列宽
    if (sheet.colWidths) {
      ws["!cols"] = sheet.colWidths.map((width) => ({ wch: width }));
    } else {
      // 默认列宽
      const defaultWidth = sheet.data[0]?.length || 2;
      ws["!cols"] = Array(defaultWidth).fill({ wch: 15 });
    }

    // 添加样式
    addStylesToWorksheet(ws, sheet.data);

    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  XLSX.writeFile(wb, filename);
};

/**
 * 从 Excel 读取数据
 */
export const readExcelFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
};
