import { validateSync } from 'class-validator';
import { CreateImportDto } from './apps/api/src/imports/create-import.dto';

const dto = new CreateImportDto();
dto.source_id = '22222222-2222-4222-8222-222222222222';
dto.parser_id = 'format-a';
dto.parser_version = '0.1.0';

console.log(validateSync(dto));
