export default function Loading() {
  return (
    <>
      <div className="page-loading-bar" aria-hidden="true" />
      <div className="panel" aria-busy="true">
        <div className="section-heading">
          <h2 className="skeleton" style={{ width: '200px', height: '28px' }}>Loading...</h2>
        </div>
        <div className="form-grid">
          <div className="skeleton" style={{ height: '80px', width: '100%' }}></div>
          <div className="skeleton" style={{ height: '80px', width: '100%' }}></div>
          <div className="skeleton span-two" style={{ height: '200px', width: '100%' }}></div>
        </div>
      </div>
    </>
  );
}
