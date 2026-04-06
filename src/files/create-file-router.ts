import { Router, NextFunction, Request, Response } from 'express';
import { ModelStatic } from 'sequelize';
import multer from 'multer';
import { HttpError } from '../app/error-handler';

export interface FileFieldConfig {
  fieldName: string;
  blobColumn: string;
  mimeTypeColumn?: string;
}

export function createFileRouter(Model: ModelStatic<any>, fieldConfig: FileFieldConfig): Router {
  const { fieldName, blobColumn, mimeTypeColumn } = fieldConfig;
  const router = Router();
  const upload = multer();

  // Upload file
  router.post(
    '/:id/' + fieldName,
    upload.single(fieldName),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const entity = await Model.findByPk(req.params.id);
        if (!entity) {
          return next(new HttpError(404, `${Model.name} not found`));
        }

        if (!req.file) {
          return next(new HttpError(400, 'No file uploaded'));
        }

        const updateData: Record<string, any> = { [blobColumn]: req.file.buffer };
        if (mimeTypeColumn) {
          updateData[mimeTypeColumn] = req.file.mimetype;
        }

        await entity.update(updateData);
        res.json({ message: 'File updated' });
      } catch (err) {
        next(err);
      }
    },
  );

  // Download file
  router.get('/:id/' + fieldName, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entity = await Model.findByPk(req.params.id);
      if (!entity || !entity[blobColumn]) {
        return next(new HttpError(404, 'File not found'));
      }

      const mimeType = mimeTypeColumn ? entity[mimeTypeColumn] : 'application/octet-stream';
      res.set('Content-Type', mimeType);
      res.send(entity[blobColumn]);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
