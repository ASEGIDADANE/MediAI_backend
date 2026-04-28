import { Injectable } from '@nestjs/common';
import { getAdminConfigSnapshot } from '../config/admin.snapshot';

@Injectable()
export class AdminConfigService {
  getConfig() {
    return getAdminConfigSnapshot();
  }
}
