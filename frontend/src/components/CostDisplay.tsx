import type { StreamCompleteEvent } from "../types/api";

interface Props {
  tokenInfo: StreamCompleteEvent;
}

export function CostDisplay({ tokenInfo }: Props) {
  return (
    <div className="cost-display">
      <div className="cost-item">
        <span className="cost-label">Input</span>
        <span className="cost-value">{tokenInfo.input_tokens.toLocaleString()} tokens</span>
      </div>
      <div className="cost-item">
        <span className="cost-label">Output</span>
        <span className="cost-value">{tokenInfo.output_tokens.toLocaleString()} tokens</span>
      </div>
      <div className="cost-item">
        <span className="cost-label">Total</span>
        <span className="cost-value">{tokenInfo.total_tokens.toLocaleString()} tokens</span>
      </div>
      <div className="cost-item cost-highlight">
        <span className="cost-label">Estimated Cost</span>
        <span className="cost-value">${tokenInfo.total_cost.toFixed(4)}</span>
      </div>
    </div>
  );
}
