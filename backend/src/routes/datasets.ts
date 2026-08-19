import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

/**
 * GET /api/datasets
 * List datasets with pagination
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [datasets, total] = await Promise.all([
      prisma.eODataset.findMany({
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.eODataset.count(),
    ]);

    res.json({ datasets, total, limit, offset });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/datasets/:id
 * Get single dataset by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dataset = await prisma.eODataset.findUnique({
      where: { id: req.params.id },
    });

    if (!dataset) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }

    res.json(dataset);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/datasets/stats
 * Get dataset statistics
 */
router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const [total, providers, collections] = await Promise.all([
      prisma.eODataset.count(),
      prisma.eODataset.groupBy({ by: ['provider'], _count: true }),
      prisma.eODataset.groupBy({ by: ['collection'], _count: true }),
    ]);

    res.json({
      total,
      byProvider: providers.map(p => ({ provider: p.provider, count: p._count })),
      byCollection: collections.map(c => ({ collection: c.collection, count: c._count })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
