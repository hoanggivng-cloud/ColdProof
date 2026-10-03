import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiParam } from '@nestjs/swagger';
import { ScenariosService } from './scenarios.service';
import { ScenariosStatusDto, ScenarioResponseDto, ScenarioBuildResultDto } from './scenarios.dto';

@ApiTags('scenarios')
@Controller('scenarios')
export class ScenariosController {
  constructor(private readonly service: ScenariosService) {}

  @Get('status')
  @ApiOkResponse({ type: ScenariosStatusDto })
  @ApiOperation({ summary: 'Get scenarios module status' })
  status() {
    return this.service.status();
  }

  @Get()
  @ApiOkResponse({ type: [ScenarioResponseDto] })
  @ApiOperation({ summary: 'List all available test scenarios (S01-S06)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: ScenarioResponseDto })
  @ApiParam({ name: 'id', example: 'S02', description: 'Scenario ID' })
  @ApiOperation({ summary: 'Get scenario manifest and expected outputs by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/build')
  @ApiOkResponse({ type: ScenarioBuildResultDto })
  @ApiParam({ name: 'id', example: 'S02', description: 'Scenario ID to build' })
  @ApiOperation({ summary: 'Build scenario from manifest (creates batch, legs, and mapping)' })
  build(@Param('id') id: string) {
    return this.service.build(id);
  }
}

