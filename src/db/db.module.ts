import { Module } from '@nestjs/common';
import { DbController } from './db.controller';
import { DbService } from './db.service';

@Module({
  //rutas que ofrece el modulo
  controllers: [DbController],

  //servcicos que puede usar el controlador
  providers: [DbService],
})
export class DbModule {}
