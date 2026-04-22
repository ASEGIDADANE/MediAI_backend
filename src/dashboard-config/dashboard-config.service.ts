import { Injectable } from '@nestjs/common';
import { getDashboardConfigSnapshot } from '../config/dashboard.snapshot';

@Injectable()
export class DashboardConfigService {
  getConfig() {
    return getDashboardConfigSnapshot();
  }
}
