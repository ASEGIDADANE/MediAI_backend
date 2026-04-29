import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

describe('EmailService', () => {
  it('logs link in development when SEND_REAL_EMAIL_IN_DEV is not set', async () => {
    const mod = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, d?: string) => {
              if (k === 'NODE_ENV') return 'development';
              if (k === 'SEND_REAL_EMAIL_IN_DEV') return '';
              return d;
            },
          },
        },
      ],
    }).compile();
    const service = mod.get(EmailService);
    await expect(
      service.sendPasswordResetLink('a@b.com', 'https://x/reset?token=1'),
    ).resolves.toBeUndefined();
  });
});
