import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  type Notification,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from './notifications.service';

type Row = Notification;

function makeRow(over: Partial<Row> = {}): Row {
  return {
    id: 'n1',
    userId: 'u1',
    type: NotificationType.booking_submitted,
    title: 'Hello',
    body: 'Body',
    actionUrl: null,
    metadata: null as unknown as Row['metadata'],
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function makePrisma() {
  const findUnique = jest.fn();
  const create = jest.fn();
  const findMany = jest.fn();
  const count = jest.fn();
  const findFirst = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();

  const prisma = {
    notification: {
      create,
      findMany,
      count,
      findFirst,
      update,
      updateMany,
    },
    user: { findUnique },
    // Match the real PrismaService signature: $transaction can be either an
    // array (used by `list`) or a callback. We only need the array variant
    // here.
    $transaction: jest.fn(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    ),
  };
  return prisma;
}

async function buildSvc(prisma: ReturnType<typeof makePrisma>) {
  const sendTransactional = jest.fn(async () => undefined);
  const email = { sendTransactional };
  const mod = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: PrismaService, useValue: prisma },
      { provide: EmailService, useValue: email },
    ],
  }).compile();
  return {
    svc: mod.get(NotificationsService),
    email,
    sendTransactional,
  };
}

describe('NotificationsService', () => {
  describe('enqueue', () => {
    it('persists an in-app row by default and skips email', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue(makeRow());
      const { svc, sendTransactional } = await buildSvc(prisma);

      await svc.enqueue({
        userId: 'u1',
        type: NotificationType.booking_submitted,
        title: 'Hi',
        body: 'World',
      });

      expect(prisma.notification.create).toHaveBeenCalledTimes(1);
      const args = prisma.notification.create.mock.calls[0][0];
      expect(args.data.userId).toBe('u1');
      expect(args.data.type).toBe(NotificationType.booking_submitted);
      expect(args.data.actionUrl).toBeNull();
      expect(sendTransactional).not.toHaveBeenCalled();
    });

    it('truncates title and body to the column lengths', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue(makeRow());
      const { svc } = await buildSvc(prisma);
      const longTitle = 'x'.repeat(300);
      const longBody = 'y'.repeat(2000);

      await svc.enqueue({
        userId: 'u1',
        type: NotificationType.system,
        title: longTitle,
        body: longBody,
      });

      const data = prisma.notification.create.mock.calls[0][0].data;
      expect(data.title.length).toBe(160);
      expect(data.body.length).toBe(1000);
    });

    it('sends an email when the email channel is requested and user has email', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue(makeRow());
      prisma.user.findUnique.mockResolvedValue({ email: 'p@example.com' });
      const { svc, sendTransactional } = await buildSvc(prisma);

      await svc.enqueue({
        userId: 'u1',
        type: NotificationType.booking_approved,
        title: 'Approved',
        body: 'Your booking was approved',
        actionUrl: '/dashboard/consultations',
        channels: ['inApp', 'email'],
      });
      // dispatchEmail is fire-and-forget; flush the microtask queue twice
      // so the awaited prisma + email calls both resolve.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(sendTransactional).toHaveBeenCalledTimes(1);
      const sent = sendTransactional.mock.calls[0][0];
      expect(sent.to).toBe('p@example.com');
      expect(sent.subject).toContain('Approved');
      expect(sent.text).toContain('Your booking was approved');
    });

    it('skips email dispatch when the user has no email on file', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockResolvedValue(makeRow());
      prisma.user.findUnique.mockResolvedValue({ email: null });
      const { svc, sendTransactional } = await buildSvc(prisma);

      await svc.enqueue({
        userId: 'u1',
        type: NotificationType.booking_approved,
        title: 'Approved',
        body: 'Your booking was approved',
        channels: ['inApp', 'email'],
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(sendTransactional).not.toHaveBeenCalled();
    });

    it('swallows persistence failures so callers are never blocked', async () => {
      const prisma = makePrisma();
      prisma.notification.create.mockRejectedValue(new Error('db down'));
      const { svc } = await buildSvc(prisma);
      // No throw — the .resolves matcher would fail loudly on any throw.
      await expect(
        svc.enqueue({
          userId: 'u1',
          type: NotificationType.system,
          title: 't',
          body: 'b',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns paginated rows + total + global unread count', async () => {
      const prisma = makePrisma();
      prisma.notification.findMany.mockResolvedValue([
        makeRow({ id: 'n1' }),
        makeRow({ id: 'n2', readAt: new Date() }),
      ]);
      prisma.notification.count
        .mockResolvedValueOnce(7) // total matching the (possibly filtered) query
        .mockResolvedValueOnce(3); // global unread regardless of filter
      const { svc } = await buildSvc(prisma);

      const res = await svc.list('u1', { page: 1, pageSize: 20 });
      expect(res.items.map((r) => r.id)).toEqual(['n1', 'n2']);
      expect(res.total).toBe(7);
      expect(res.unreadCount).toBe(3);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(20);
    });

    it('filters to unread when unreadOnly is true', async () => {
      const prisma = makePrisma();
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      const { svc } = await buildSvc(prisma);

      await svc.list('u1', { unreadOnly: true });
      const where = prisma.notification.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.readAt).toBeNull();
    });

    it('clamps pageSize to the safe maximum', async () => {
      const prisma = makePrisma();
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);
      const { svc } = await buildSvc(prisma);

      const res = await svc.list('u1', { page: 1, pageSize: 1000 });
      expect(res.pageSize).toBeLessThanOrEqual(50);
    });
  });

  describe('markRead', () => {
    it('updates readAt only when currently unread', async () => {
      const prisma = makePrisma();
      const row = makeRow({ id: 'n1', readAt: null });
      prisma.notification.findFirst.mockResolvedValue(row);
      prisma.notification.update.mockResolvedValue({
        ...row,
        readAt: new Date(),
      });
      const { svc } = await buildSvc(prisma);

      const dto = await svc.markRead('u1', 'n1');
      expect(prisma.notification.update).toHaveBeenCalledTimes(1);
      expect(dto.readAt).not.toBeNull();
    });

    it('is idempotent for already-read rows', async () => {
      const prisma = makePrisma();
      const readAt = new Date('2026-01-02T00:00:00.000Z');
      prisma.notification.findFirst.mockResolvedValue(
        makeRow({ id: 'n1', readAt }),
      );
      const { svc } = await buildSvc(prisma);

      const dto = await svc.markRead('u1', 'n1');
      expect(prisma.notification.update).not.toHaveBeenCalled();
      expect(dto.readAt).toBe(readAt.toISOString());
    });

    it('throws 404 when the notification belongs to someone else', async () => {
      const prisma = makePrisma();
      prisma.notification.findFirst.mockResolvedValue(null);
      const { svc } = await buildSvc(prisma);
      await expect(svc.markRead('u1', 'n1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('markAllRead', () => {
    it('only touches unread rows', async () => {
      const prisma = makePrisma();
      prisma.notification.updateMany.mockResolvedValue({ count: 4 });
      const { svc } = await buildSvc(prisma);

      const res = await svc.markAllRead('u1');
      expect(res.updated).toBe(4);
      const where = prisma.notification.updateMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.readAt).toBeNull();
    });
  });
});
