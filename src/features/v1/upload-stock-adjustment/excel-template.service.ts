import { injectable } from 'inversify';
import { Request, Response } from 'express';
import { Workbook } from 'exceljs';
import { uploadStockAdjustmentConstant as cst } from './constants/upload-stock-adjustment.constant';
import { HTTP_STATUS } from '@/shared-libs/constants/http-status.constant';
import { BadRequestException } from '@/shared-libs/exceptions';

/**
 * Generate template Upload Stock Adjustment secara dinamis (pola
 * ExcelTemplateService upload-incoming-ahm): instruction rows, header baris 5,
 * kolom opsional kuning (MaterialBrand), baris contoh, dan sheet Ref_bodyKey
 * (veryHidden) sebagai kunci integritas header<->key untuk parsing frontend.
 */
@injectable()
export class ExcelTemplateService {
  async generateTemplate(_req: Request, res: Response) {
    const { columns } = cst;

    const workBook = new Workbook();
    const workSheet = workBook.addWorksheet(cst.excelSheetMain);

    // === Ref_bodyKey (veryHidden): header <-> field key ===
    const headersAndKey = columns.map((c) => ({ header: c.header, key: c.key }));
    if (columns.length !== headersAndKey.length) {
      throw new BadRequestException(cst.messages.templateHeadersKeyNotMatch);
    }
    const refSheet = workBook.addWorksheet(cst.excelSheetBodyKey, {
      state: cst.excelSheetStateVeryHidden,
    });
    refSheet.addRow([cst.keyName, cst.keyId]);
    headersAndKey.forEach((hnk) => refSheet.addRow([hnk.header, hnk.key]));

    // === Main sheet: mandatory read + instruksi ===
    const rowMandatoryRead = workSheet.addRow([cst.excelMandatoryRead]);
    rowMandatoryRead.font = { bold: true };

    const rowInstruction1 = workSheet.addRow([cst.excelInstructionPoint1]);
    workSheet.mergeCells(
      `A${rowInstruction1.number}:E${rowInstruction1.number}`,
    );
    const rowInstruction2 = workSheet.addRow([cst.excelInstructionPoint2]);
    workSheet.mergeCells(
      `A${rowInstruction2.number}:E${rowInstruction2.number}`,
    );
    workSheet.addRow([]); // spasi 1 baris

    // === Header row 5 ===
    const headerRow = workSheet.getRow(cst.headerRowNumber);
    headerRow.values = columns.map((c) => c.header);
    columns.forEach(
      (column, index) =>
        (workSheet.getColumn(index + 1).width = column.width),
    );
    headerRow.eachCell((cell, colNumber) => {
      const isOptional = columns[colNumber - 1]?.optional;
      if (isOptional) {
        cell.fill = {
          type: cst.stringTypePattern as any,
          pattern: cst.stringPatternSolid,
          fgColor: { argb: cst.yellowHexColor },
        };
        cell.font = { bold: false };
      } else {
        cell.font = { bold: true };
      }
    });

    // === Baris contoh ===
    workSheet.addRow([...cst.exampleRow] as unknown[]);

    // === Kirim sebagai file download ===
    const buffer = await workBook.xlsx.writeBuffer();
    res.setHeader(
      cst.stringHeaderNameContentType,
      cst.stringHeaderValueSpreadsheet,
    );
    res.setHeader(
      cst.stringHeaderNameContentDisposition,
      cst.stringHeaderValueFilename,
    );
    res.end(buffer);

    return {
      data: null,
      httpCode: HTTP_STATUS.OK,
    };
  }
}
