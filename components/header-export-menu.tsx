'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Download, FileDown, Loader2, Package } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useExportClassroom } from '@/lib/export/use-export-classroom';
import { useExportPPTX } from '@/lib/export/use-export-pptx';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useStageStore } from '@/lib/store/stage';
import { cn } from '@/lib/utils';

export function HeaderExportMenu() {
  const { t } = useI18n();
  const { exporting: isExporting, exportPPTX, exportResourcePack } = useExportPPTX();
  const { exporting: isExportingZip, exportClassroomZip } = useExportClassroom();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const scenes = useStageStore((s) => s.scenes);
  const generatingOutlines = useStageStore((s) => s.generatingOutlines);
  const failedOutlines = useStageStore((s) => s.failedOutlines);
  const mediaTasks = useMediaGenerationStore((s) => s.tasks);

  const canExport =
    scenes.length > 0 &&
    generatingOutlines.length === 0 &&
    failedOutlines.length === 0 &&
    Object.values(mediaTasks).every((task) => task.status === 'done' || task.status === 'failed');

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (exportMenuOpen && exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    },
    [exportMenuOpen],
  );

  useEffect(() => {
    if (!exportMenuOpen) return;
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [exportMenuOpen, handleClickOutside]);

  return (
    <div className="relative" ref={exportRef}>
      <button
        onClick={() => {
          if (canExport && !isExporting && !isExportingZip) setExportMenuOpen(!exportMenuOpen);
        }}
        disabled={!canExport || isExporting || isExportingZip}
        title={
          canExport
            ? isExporting || isExportingZip
              ? t('export.exporting')
              : t('export.pptx')
            : t('share.notReady')
        }
        className={cn(
          'shrink-0 p-2 rounded-full transition-all',
          canExport && !isExporting && !isExportingZip
            ? 'text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm'
            : 'text-gray-300 dark:text-gray-600 cursor-not-allowed opacity-50',
        )}
      >
        {isExporting || isExportingZip ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
      {exportMenuOpen && (
        <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[200px]">
          <button
            onClick={() => {
              setExportMenuOpen(false);
              exportPPTX();
            }}
            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
          >
            <FileDown className="w-4 h-4 text-gray-400 shrink-0" />
            <span>{t('export.pptx')}</span>
          </button>
          <button
            onClick={() => {
              setExportMenuOpen(false);
              exportResourcePack();
            }}
            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
          >
            <Package className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.resourcePack')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.resourcePackDesc')}
              </div>
            </div>
          </button>
          <button
            onClick={() => {
              setExportMenuOpen(false);
              exportClassroomZip();
            }}
            disabled={isExportingZip}
            className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2.5"
          >
            <Archive className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{t('export.classroomZip')}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('export.classroomZipDesc')}
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
