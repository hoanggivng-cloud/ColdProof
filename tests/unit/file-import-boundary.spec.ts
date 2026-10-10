jest.mock('@nestjs/common', () => {
  throw new Error('The pure D10 boundary must not load NestJS');
});

describe('D10 public import boundary', () => {
  it('loads without evaluating NestJS providers', async () => {
    const publicApi = await import('../../apps/api/src/adapters/file-import');

    expect(publicApi).toEqual(expect.objectContaining({
      inspectLoggerFile: expect.any(Function),
      parseLoggerFile: expect.any(Function),
      assessImportedMeasurements: expect.any(Function),
      parseMendeleySpreadsheetContext: expect.any(Function),
    }));
  });
});
