'use client';

import { useEffect } from 'react';
import { FileDown, Package } from 'lucide-react';

import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useI18n } from '@/lib/hooks/use-i18n';

interface HeaderExportMenuProps {
  onClose: () => void;
  onExportStateChange: (isExporting: boolean) => void;
}

export function HeaderExportMenu({
  onClose,
  onExportStateChange,
}: HeaderExportMenuProps) {
  const { t } = useI18n();
  const { exporting, exportPPTX, exportResourcePack } = useExportPPTX();

  useEffect(() => {
    onExportStateChange(exporting);
  }, [exporting, onExportStateChange]);

  useEffect(() => {
    return () => onExportStateChange(false);
  }, [onExportStateChange]);

  const handleExportPptx = async () => {
    await exportPPTX();
    onClose();
  };

  const handleExportResourcePack = async () => {
    await exportResourcePack();
    onClose();
  };

  return (
    <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[200px]">
      <button
        onClick={handleExportPptx}
        disabled={exporting}
        className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
        <span>{t('export.pptx')}</span>
      </button>
      <button
        onClick={handleExportResourcePack}
        disabled={exporting}
        className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Package className="w-4 h-4 text-gray-400 shrink-0" />
        <div>
          <div>{t('export.resourcePack')}</div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500">
            {t('export.resourcePackDesc')}
          </div>
        </div>
      </button>
    </div>
  );
}
