/**
 * @fileoverview 设置页列表无搜索结果占位。
 */

type SettingsEmptyResultsProps = {
  query: string;
  onClear: () => void;
};

/** 搜索无匹配时的提示。 */
export function SettingsEmptyResults({ query, onClear }: SettingsEmptyResultsProps) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
      <p>
        未找到与「<span className="font-medium text-gray-700">{query.trim()}</span>」匹配的内容
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-xs font-medium text-orange-600 hover:underline"
      >
        清除搜索
      </button>
    </div>
  );
}
