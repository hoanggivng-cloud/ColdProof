'use client';
import Link from 'next/link';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ShipmentDraft, HandoverDraft } from '../../types/shipment-workflow';

interface WorkflowContext {
  shipment: ShipmentDraft | null;
  deviceIds: string[];
  devicesConfirmed: boolean;
  handover: HandoverDraft | null;
  importCompleted: boolean;
  prepare: (shipment: ShipmentDraft, ids?: string[]) => void;
  assign: (ids: string[], confirmed?: boolean) => void;
  saveHandover: (handover: HandoverDraft) => void;
  setImportCompleted: (completed: boolean) => void;
  invalidate: () => void;
  reset: () => void;
}

const Context = createContext<WorkflowContext | null>(null);

export function ShipmentWorkflowProvider({ children }: { children: ReactNode }) {
  const [shipment, setShipment] = useState<ShipmentDraft | null>(null);
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [devicesConfirmed, setDevicesConfirmed] = useState(false);
  const [handover, setHandover] = useState<HandoverDraft | null>(null);
  const [importCompleted, setImportCompleted] = useState(false);

  const invalidate = () => {
    setShipment(null);
    setDevicesConfirmed(false);
    setHandover(null);
    setImportCompleted(false);
  };

  return (
    <Context.Provider
      value={{
        shipment,
        deviceIds,
        devicesConfirmed,
        handover,
        importCompleted,
        prepare: (value, ids = []) => {
          setShipment(value);
          setDeviceIds(ids);
          setDevicesConfirmed(false);
          setHandover(null);
          setImportCompleted(false);
        },
        assign: (ids, confirmed = true) => {
          setDeviceIds(ids);
          setDevicesConfirmed(Boolean(shipment) && ids.length > 0 && confirmed);
        },
        saveHandover: (value) => {
          if (shipment && devicesConfirmed) setHandover(value);
        },
        setImportCompleted: (completed) => {
          setImportCompleted(completed);
        },
        invalidate,
        reset: () => {
          invalidate();
          setDeviceIds([]);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useShipmentWorkflow() {
  const context = useContext(Context);
  if (!context) throw new Error('ShipmentWorkflowProvider is required');
  return context;
}

const processSteps: [string, string][] = [
  ['Tạo Shipment', '/batches/new'],
  ['Gán thiết bị', '/batches/new'],
  ['Ghi nhận bàn giao', '/batches/new'],
  ['Phân tích', '/batches'],
  ['QA review', '/qa'],
  ['Hồ sơ', '/reports'],
];

export function WorkflowProgress({ current, batchId }: { current?: number; batchId?: string }) {
  const { shipment, devicesConfirmed, handover } = useShipmentWorkflow();
  const formStep = !shipment ? 0 : !devicesConfirmed ? 1 : !handover ? 2 : 3;
  const active = current ?? formStep;

  return (
    <nav aria-label="Quy trình xử lý lô" className="workflow-progress process-steps">
      <ol>
        {processSteps.map(([label, href], index) => {
          const complete = current !== undefined ? index < current : (index < 3 && index < formStep);
          const inForm = index < 3;
          const target = index === 3 && batchId ? `/batches/${encodeURIComponent(batchId)}` : href;

          return (
            <li key={label} aria-current={index === active ? 'step' : undefined} data-complete={complete}>
              <span>
                {complete ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <Link href={target}>
                  <strong>{label}</strong>
                </Link>
                <small>
                  {index === active
                    ? 'Bước hiện tại'
                    : complete
                    ? index >= 3
                      ? 'Đã lưu server'
                      : 'Xong'
                    : inForm
                    ? 'Chưa thực hiện'
                    : 'Xem trên server'}
                </small>
                <small className="process-source">
                  {complete || index >= 3 ? 'Dữ liệu server' : 'Chưa lưu server'}
                </small>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
