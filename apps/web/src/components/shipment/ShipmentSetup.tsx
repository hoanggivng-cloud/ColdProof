'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { SetupDevice, TemperaturePreset } from '../../types/shipment-setup';
import { RoleGate } from '../auth/RoleGate';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Table } from '../ui/Table';
import { PageHeader } from '../layout/PageHeader';
import { AssignLoggerDialog } from './AssignLoggerDialog';
import { useShipmentWorkflow, WorkflowProgress } from './ShipmentWorkflow';
import { RecordHandoverDialog } from './RecordHandoverDialog';
import { useSession } from '../auth/SessionProvider';

export function ShipmentSetup({ presets, devices }: { presets: TemperaturePreset[]; devices: SetupDevice[] }) {
  const { hasRole } = useSession();
  const isOperator = hasRole('OPERATOR') && !hasRole('ADMIN');
  const workflow = useShipmentWorkflow();
  const [restored, setRestored] = useState(workflow.shipment);
  const [formVersion, setFormVersion] = useState(0);
  const [profileId, setProfileId] = useState(workflow.shipment?.profileId ?? presets[0]?.id ?? '');

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('profile');
    if (!workflow.shipment && requested && presets.some((item) => item.id === requested)) {
      setProfileId(requested);
    }
  }, [workflow.shipment, presets]);

  const initialSelection = devices.filter((device) => device.initiallySelected && device.allocationAllowed).map((device) => device.id);
  const [selected, setSelected] = useState<string[]>(workflow.deviceIds.length > 0 ? workflow.deviceIds : initialSelection);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [assign, setAssign] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [_saveSuccess, setSaveSuccess] = useState<string | null>(workflow.shipment?.lot ?? null);
  const [isDirty, setIsDirty] = useState(false);
  const profile = presets.find((item) => item.id === profileId);

  const saveToServer = async (targetLot?: string, deviceList?: string[]) => {
    const lotToSave = targetLot ?? workflow.shipment?.lot;
    if (!lotToSave) return false;
    setSaving(true);
    try {
      const response = await fetch('/api/backend/batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: lotToSave,
          scenario_id: 'S02',
          profile_id: profileId,
          lower_threshold: profile?.lower ?? 2.0,
          upper_threshold: profile?.upper ?? 8.0,
          device_ids: deviceList ?? selected,
        }),
      });

      if (!response.ok && response.status !== 409) {
        const err: unknown = await response.json().catch(() => ({}));
        const msg =
          typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Không thể lưu lô lên server. Kiểm tra kết nối.';
        setMessage(msg);
        return false;
      }

      setSaveSuccess(lotToSave);
      setIsDirty(false);
      return true;
    } catch {
      setMessage('Không kết nối được server.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    workflow.reset();
    setRestored(null);
    setFormVersion((value) => value + 1);
    setProfileId(presets[0]?.id ?? '');
    setSelected(initialSelection);
    setIssues([]);
    setMessage('');
    setAssign(false);
    setHandoverOpen(false);
    setSaveSuccess(null);
  };

  // Submit Bước 1: Tạo Shipment (chỉ thông tin shipment và profile nhiệt độ)
  const submitShipment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const errors: string[] = [];
    const names: [string, string][] = [
      ['product', 'Sản phẩm'],
      ['lot', 'Mã lô'],
      ['origin', 'Điểm xuất phát'],
      ['destination', 'Điểm nhận'],
      ['start', 'Thời gian bắt đầu'],
      ['end', 'Thời gian kết thúc'],
      ['reference', 'Mã vận đơn'],
      ['sop', 'Phiên bản SOP'],
    ];

    let firstInvalidKey: string | null = null;
    for (const [key, label] of names) {
      if (!String(values.get(key) ?? '').trim()) {
        errors.push(`${label}: cần nhập thông tin.`);
        if (!firstInvalidKey) firstInvalidKey = key;
      }
    }
    const start = String(values.get('start') ?? '');
    const end = String(values.get('end') ?? '');
    if (start && end && end <= start) {
      errors.push('Thời gian kết thúc phải sau thời gian bắt đầu.');
      if (!firstInvalidKey) firstInvalidKey = 'end';
    }
    if (!profile) errors.push('Cần chọn profile nhiệt độ.');

    if (errors.length > 0) {
      setIssues(errors);
      setMessage(`${errors.length} thông tin cần kiểm tra trước khi tạo Shipment.`);
      if (firstInvalidKey) {
        const el = document.querySelector<HTMLElement>(`[name="${firstInvalidKey}"]`) || document.getElementById(`shipment-${firstInvalidKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }
      return;
    }

    setIssues([]);
    const get = (key: string) => String(values.get(key) ?? '').trim();
    const lot = get('lot');

    // Lưu thông tin shipment vào workflow (chưa gán thiết bị ở Bước 1)
    workflow.prepare({
      product: get('product'),
      lot,
      transport: get('transport'),
      origin: get('origin'),
      destination: get('destination'),
      start,
      end,
      reference: get('reference'),
      sop: get('sop'),
      notes: get('notes'),
      profileId,
      originType: 'SYNTHETIC',
    });

    const success = await saveToServer(lot, []);
    if (success) {
      setMessage(`✅ Đã tạo Shipment lô ${lot} thành công! Hãy tiếp tục Bước 2: Gán thiết bị bên dưới.`);
    }
  };

  // Xác nhận Bước 2: Gán thiết bị
  const handleConfirmDevices = async () => {
    if (!selected.length) {
      setMessage('Vui lòng chọn ít nhất 1 thiết bị trước khi xác nhận.');
      return;
    }
    const lot = workflow.shipment?.lot;
    if (!lot) {
      setMessage('Chưa có thông tin lô. Vui lòng hoàn thành Bước 1 trước.');
      return;
    }

    const success = await saveToServer(lot, selected);
    if (success) {
      workflow.assign(selected, true);
      setMessage(`✅ Đã gán ${selected.length} thiết bị cho lô ${lot}! Tiếp tục Bước 3: Ghi nhận bàn giao.`);
    }
  };

  const field = (id: string, label: string, control: ReactNode, className?: string, hint?: string) => (
    <Field id={id} label={label} className={className} hint={hint}>
      {control}
    </Field>
  );

  return (
    <>
      <PageHeader
        title="Tạo Shipment"
        breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Tạo Shipment' }]}
        description="Quy trình 3 bước tại kho: Tạo lô shipment, gán thiết bị theo dõi và ghi nhận biên bản bàn giao."
      >
        <Button href="/batches">Xem danh sách lô</Button>
      </PageHeader>

      <WorkflowProgress />

      <RoleGate
        roles={['OPERATOR', 'ADMIN']}
        fallback={
          <Alert tone="warning" title="Không có quyền tạo Shipment">
            Tạo Shipment cần vai trò Operator hoặc Admin. Vai trò hiện tại chỉ xem lô và hồ sơ.
          </Alert>
        }
      >
        {issues.length > 0 && (
          <Alert tone="error" title={`${issues.length} thông tin cần kiểm tra`}>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Alert>
        )}

        {/* ==================== BƯỚC 1: TẠO SHIPMENT (THUẦN THÔNG TIN LÔ & PROFILE) ==================== */}
        <form
          id="shipment-form"
          key={formVersion}
          noValidate
          onSubmit={submitShipment}
          onReset={reset}
          onChange={(event) => {
            if (!(event.target instanceof HTMLElement) || event.target.closest('dialog')) return;
            if (workflow.shipment && !isDirty) {
              setIsDirty(true);
              setMessage('Thông tin đã thay đổi. Hãy lưu lại Shipment.');
            }
          }}
        >
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Bước 1. Thông tin Shipment & Vận chuyển</h2>
                <p>Nhập mã lô, sản phẩm và hành trình vận chuyển chuỗi lạnh</p>
              </div>
              <Button type="reset">Đặt lại form</Button>
            </div>
            <div className="form-grid">
              {field(
                'shipment-id',
                'Shipment ID',
                <input id="shipment-id" readOnly value="Được cấp khi server tạo lô" aria-describedby="shipment-id-hint" />,
                undefined,
                'Tự động tạo mã lô trên server',
              )}
              {field(
                'shipment-lot',
                'Batch / Lot Number *',
                <input
                  id="shipment-lot"
                  name="lot"
                  defaultValue={restored?.lot ?? ''}
                  required
                  className="number"
                  placeholder="VD: LOT-VN-2026-01"
                  maxLength={80}
                />,
              )}
              {field(
                'shipment-product',
                'Sản phẩm *',
                <input
                  id="shipment-product"
                  name="product"
                  defaultValue={restored?.product ?? ''}
                  required
                  placeholder="Nhập tên sản phẩm"
                  maxLength={120}
                />,
              )}
              {field(
                'shipment-transport',
                'Loại vận chuyển',
                <select id="shipment-transport" name="transport" defaultValue={restored?.transport}>
                  <option>Xe lạnh</option>
                  <option>Đường hàng không</option>
                  <option>Vận chuyển có kiểm soát nhiệt độ</option>
                </select>,
              )}
              {field(
                'shipment-origin',
                'Điểm xuất phát *',
                <input
                  id="shipment-origin"
                  name="origin"
                  defaultValue={restored?.origin ?? ''}
                  required
                  placeholder="Nhập kho hoặc điểm xuất phát"
                  maxLength={200}
                />,
              )}
              {field(
                'shipment-destination',
                'Điểm nhận *',
                <input
                  id="shipment-destination"
                  name="destination"
                  defaultValue={restored?.destination ?? ''}
                  required
                  placeholder="Nhập điểm nhận"
                  maxLength={200}
                />,
              )}
              {field(
                'shipment-start',
                'Thời gian bắt đầu (UTC+7) *',
                <input
                  id="shipment-start"
                  name="start"
                  defaultValue={restored?.start ?? ''}
                  type="datetime-local"
                  required
                  className="number"
                />,
              )}
              {field(
                'shipment-end',
                'Thời gian kết thúc (UTC+7) *',
                <input
                  id="shipment-end"
                  name="end"
                  defaultValue={restored?.end ?? ''}
                  type="datetime-local"
                  required
                  className="number"
                />,
              )}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Profile nhiệt độ bảo quản</h2>
                <p>Thiết lập ngưỡng nhiệt độ an toàn theo tiêu chuẩn GDP/GSP</p>
              </div>
              <Badge tone="synthetic">Chuẩn GDP/GSP</Badge>
            </div>
            <div className="form-grid">
              {field(
                'shipment-profile',
                'Profile nhiệt độ',
                <select id="shipment-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                  {presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label} · {item.id}
                    </option>
                  ))}
                </select>,
                'span-full',
              )}
              {field('profile-lower', 'Ngưỡng dưới (°C)', <input id="profile-lower" readOnly value={profile?.lower ?? ''} className="number" />)}
              {field('profile-upper', 'Ngưỡng trên (°C)', <input id="profile-upper" readOnly value={profile?.upper ?? ''} className="number" />)}
              {field(
                'profile-duration',
                'Thời lượng tiêu chuẩn (phút)',
                <input
                  id="profile-duration"
                  readOnly
                  value={profile?.durationMinutes ?? ''}
                  className="number"
                  aria-describedby="profile-duration-hint"
                />,
              )}
            </div>
            {profile && (
              <div className="thermal-preview" aria-label="Xem trước ngưỡng">
                <span>Dưới {profile.lower}°C</span>
                <span>
                  Khoảng {profile.lower}°C – {profile.upper}°C
                </span>
                <span>Trên {profile.upper}°C</span>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Thông tin tham chiếu & QA</h2>
                <p>Mã vận đơn, SOP và ghi chú hướng dẫn xử lý</p>
              </div>
            </div>
            <div className="form-grid">
              {field(
                'shipment-reference',
                'Mã vận đơn / tham chiếu *',
                <input
                  id="shipment-reference"
                  name="reference"
                  defaultValue={restored?.reference ?? 'REF-2026-001'}
                  required
                  maxLength={100}
                  placeholder="VD: REF-2026-001"
                />,
              )}
              {field(
                'shipment-sop',
                'Phiên bản SOP *',
                <input
                  id="shipment-sop"
                  name="sop"
                  defaultValue={restored?.sop ?? 'SOP-COLD-01 (v2.4)'}
                  required
                  maxLength={100}
                  placeholder="VD: SOP-COLD-01 (v2.4)"
                />,
              )}
              {field(
                'shipment-notes',
                'Ghi chú / hướng dẫn xử lý',
                <textarea
                  id="shipment-notes"
                  name="notes"
                  defaultValue={restored?.notes ?? ''}
                  rows={2}
                  maxLength={500}
                  aria-describedby="shipment-notes-hint"
                />,
                'span-full',
                'Tối đa 500 ký tự',
              )}
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button primary type="submit" disabled={saving}>
                {saving ? 'Đang lưu…' : workflow.shipment ? 'Lưu thay đổi Shipment' : 'Tạo Shipment & Sang Bước 2: Gán thiết bị'}
              </Button>
            </div>
          </section>
        </form>

        {/* ==================== BƯỚC 2: GÁN THIẾT BỊ (THUẦN GÁN VÀ XÁC NHẬN LOGGER) ==================== */}
        <section
          className="panel"
          style={{
            opacity: !workflow.shipment ? 0.6 : 1,
            pointerEvents: !workflow.shipment ? 'none' : 'auto',
            border: workflow.shipment && !workflow.devicesConfirmed ? '2px solid var(--accent, #0066cc)' : undefined,
          }}
        >
          <div className="section-heading">
            <div>
              <h2>Bước 2. Gán thiết bị Logger cho lô</h2>
              <p>
                {!workflow.shipment
                  ? 'Hoàn thành Bước 1 (Tạo Shipment) trước khi gán thiết bị.'
                  : `Chọn các logger theo dõi nhiệt độ gắn với lô ${workflow.shipment.lot}`}
              </p>
            </div>
            <Button disabled={!workflow.shipment} onClick={() => setAssign(true)}>
              {selected.length ? 'Thay đổi thiết bị' : 'Gán thiết bị'}
            </Button>
          </div>

          {assign && (
            <AssignLoggerDialog
              devices={devices}
              selected={selected}
              onClose={() => setAssign(false)}
              onConfirm={(ids) => {
                setSelected(ids);
                setAssign(false);
              }}
            />
          )}

          {devices.some((device) => selected.includes(device.id) && device.warning) && (
            <Alert tone="warning" title="Kiểm tra hiệu chuẩn">
              Một thiết bị đã chọn cần kiểm tra hạn hiệu chuẩn. Giữ riêng các chuỗi cảm biến.
            </Alert>
          )}

          <Table label="Thiết bị đã gán">
            <thead>
              <tr>
                {['Thiết bị', 'Serial', 'Model', 'Kênh', 'Hiệu chuẩn'].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
                <th scope="col" className="number">
                  Pin
                </th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {devices
                .filter((device) => selected.includes(device.id))
                .map((device) => (
                  <tr key={device.id}>
                    <td className="number">{device.id}</td>
                    <td className="number">{device.serial}</td>
                    <td>{device.model}</td>
                    <td>{device.channel}</td>
                    <td>
                      <Badge tone={device.warning ? 'warning' : 'neutral'}>{device.calibrationLabel}</Badge>
                    </td>
                    <td className="number">{device.battery}%</td>
                    <td>
                      <Button
                        variant="text"
                        onClick={() => {
                          const ids = selected.filter((id) => id !== device.id);
                          setSelected(ids);
                          workflow.assign(ids, false);
                        }}
                      >
                        Bỏ gán
                      </Button>
                    </td>
                  </tr>
                ))}
              {!selected.length && (
                <tr>
                  <td colSpan={7}>Chưa chọn thiết bị. Nhấn nút &quot;Gán thiết bị&quot; để chọn logger theo dõi.</td>
                </tr>
              )}
            </tbody>
          </Table>

          {workflow.shipment && (
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button primary disabled={saving || selected.length === 0} onClick={handleConfirmDevices}>
                {workflow.devicesConfirmed ? 'Cập nhật thiết bị đã gán' : 'Xác nhận gán thiết bị & Sang Bước 3: Ghi nhận bàn giao'}
              </Button>
            </div>
          )}
        </section>

        {/* ==================== BƯỚC 3: GHI NHẬN BÀN GIAO (HANDOVER) ==================== */}
        <section
          className="panel"
          style={{
            opacity: !workflow.shipment || !workflow.devicesConfirmed ? 0.6 : 1,
            pointerEvents: !workflow.shipment || !workflow.devicesConfirmed ? 'none' : 'auto',
            border: workflow.devicesConfirmed && !workflow.handover ? '2px solid var(--accent, #0066cc)' : undefined,
          }}
        >
          <div className="section-heading">
            <div>
              <h2>Bước 3. Ghi nhận bàn giao (Handover)</h2>
              <p>Hoàn thành gán thiết bị trước khi ghi nhận biên bản giao nhận</p>
            </div>
            <Button disabled={!workflow.shipment || !workflow.devicesConfirmed} onClick={() => setHandoverOpen(true)}>
              {workflow.handover ? 'Chỉnh sửa bàn giao' : 'Ghi nhận bàn giao'}
            </Button>
          </div>

          {!workflow.handover ? (
            <p style={{ color: 'var(--text-sub)' }}>Chưa ghi nhận bàn giao trong form.</p>
          ) : (
            <>
              <Alert>Biên bản bàn giao đã được ghi nhận trong phiên xử lý lô.</Alert>
              <dl className="workflow-summary">
                <dt>Thời gian (UTC+7)</dt>
                <dd className="number">{workflow.handover.timestampRaw.replace('T', ' ')}</dd>
                <dt>Địa điểm</dt>
                <dd>{workflow.handover.location}</dd>
                <dt>Bàn giao</dt>
                <dd>
                  {workflow.handover.fromParty} → {workflow.handover.toParty}
                </dd>
                <dt>Người giao / nhận</dt>
                <dd>
                  {workflow.handover.sender} / {workflow.handover.receiver}
                </dd>
                <dt>Tài liệu</dt>
                <dd>{workflow.handover.attachment?.name ?? 'Chưa chọn tài liệu'}</dd>
              </dl>
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {isOperator ? (
                  <>
                    <Alert tone="info" title="Hành trình vận chuyển đã sẵn sàng / bắt đầu">
                      Lô hàng đã được gán thiết bị theo dõi và hoàn tất biên bản bàn giao. Logger đang liên tục ghi nhận các thông số trong suốt chuyến đi. Sau khi chuyến hàng hoàn thành, hồ sơ và file log sẽ được bàn giao cho bộ phận QA Reviewer để nạp hệ thống và thẩm định chất lượng.
                    </Alert>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                      <Button primary href="/batches">
                        Hoàn tất bàn giao & Về danh sách lô hàng →
                      </Button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <Button href="/batches">Về danh sách lô</Button>
                    <Button primary href="/imports">
                      Tiếp tục sang Bước 4: Import dữ liệu logger (QA Reviewer) →
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Thông báo tiến độ chung */}
        {message && (
          <div style={{ marginTop: '1rem' }}>
            <Alert role="status">{message}</Alert>
          </div>
        )}

        {handoverOpen && workflow.shipment && (
          <RecordHandoverDialog
            shipment={workflow.shipment}
            initial={workflow.handover}
            onClose={() => setHandoverOpen(false)}
            onSave={(value) => {
              workflow.saveHandover(value);
              setHandoverOpen(false);
              if (isOperator) {
                setMessage('✅ Đã ghi nhận biên bản bàn giao thành công! Lô hàng đang trong quá trình vận chuyển.');
              } else {
                setMessage('✅ Đã ghi nhận biên bản bàn giao thành công! Bạn có thể chuyển sang Bước 4: Import dữ liệu logger.');
              }
            }}
          />
        )}
      </RoleGate>
    </>
  );
}
