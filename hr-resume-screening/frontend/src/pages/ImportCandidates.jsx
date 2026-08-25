import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Mail,
  Folder,
  FolderPlus,
  FileText,
  Upload,
  Search,
  CheckCircle2,
  Loader2,
  Users,
  Play,
  FileCheck,
  Eye,
  Lock,
  Settings2,
  Sparkles
} from 'lucide-react';
import {
  getJobById,
  getOutlookStatus,
  getOutlookFolders,
  searchOutlookEmails,
  processCandidates,
  uploadBulkCandidates
} from '../services/api';
import { Card, EmptyState, InlineAlert, PageHeader, ProgressBar } from '../components/ui';
import RouteSkeleton from '../components/ui/RouteSkeleton';

const ImportCandidates = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' | 'outlook'
  const [dragActive, setDragActive] = useState(false);

  // SINGLE UPLOAD STATE

  // BULK & FOLDER UPLOAD STATE
  const [bulkFiles, setBulkFiles] = useState([]); // [{ file, relativePath, status: 'WAITING' | 'PROCESSING' | 'SUCCESS' | 'DUPLICATE' | 'FAILED' | 'UNSUPPORTED', result: null, error: null }]
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({
    total: 0,
    processed: 0,
    success: 0,
    duplicates: 0,
    failed: 0,
    unsupported: 0
  });
  const [bulkCompleted, setBulkCompleted] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // OUTLOOK STATE
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookAccount, setOutlookAccount] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const firstOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(firstOfMonthStr);
  const [toDate, setToDate] = useState(todayStr);
  const [searchingOutlook, setSearchingOutlook] = useState(false);
  const [outlookSummary, setOutlookSummary] = useState(null);
  const [outlookProcessing, setOutlookProcessing] = useState(false);
  const [outlookProcessResult, setOutlookProcessResult] = useState(null);
  const [outlookError, setOutlookError] = useState('');

  useEffect(() => {
    fetchInitialData();
  }, [jobId]);

  const fetchInitialData = async () => {
    try {
      setLoadingJob(true);
      const jobRes = await getJobById(jobId);
      if (jobRes.success) {
        setJob(jobRes.data);
      }

      // Check Outlook Status. The API returns the connection under `data`;
      // reading statusRes.connected left this page permanently "disconnected".
      const statusRes = await getOutlookStatus();
      if (statusRes.success && statusRes.data?.connected) {
        setOutlookConnected(true);
        setOutlookAccount({ email: statusRes.data.email, displayName: statusRes.data.displayName });
        loadFolders();
      } else {
        setOutlookConnected(false);
      }
    } catch (err) {
      // Ignore non-fatal initialization errors
    } finally {
      setLoadingJob(false);
    }
  };

  const loadFolders = async () => {
    try {
      setLoadingFolders(true);
      const res = await getOutlookFolders();
      if (res.success && Array.isArray(res.data)) {
        setFolders(res.data);
        const naukriFolder = res.data.find(f => f.name.toLowerCase().includes('naukri'));
        if (naukriFolder) {
          setSelectedFolder(naukriFolder.id);
        } else if (res.data.length > 0) {
          setSelectedFolder(res.data[0].id);
        }
      }
    } catch (err) {
      setOutlookError('Could not load Outlook mail folders.');
    } finally {
      setLoadingFolders(false);
    }
  };

  // ----------------------------------------------------
  // BULK & FOLDER RESUME UPLOAD HANDLERS
  // ----------------------------------------------------
  const processRawFiles = (fileList) => {
    const filesArr = Array.from(fileList);
    const ALLOWED_EXTS = ['.pdf', '.docx', '.txt'];

    const items = filesArr.map(file => {
      const ext = (file.name.substring(file.name.lastIndexOf('.')) || '').toLowerCase();
      const relativePath = file.webkitRelativePath || file.name;
      const isSupported = ALLOWED_EXTS.includes(ext);

      return {
        file,
        fileName: file.name,
        size: file.size,
        ext,
        relativePath,
        status: isSupported ? 'WAITING' : 'UNSUPPORTED',
        result: null,
        error: isSupported ? null : `Unsupported file format (${ext || 'unknown'}).`
      };
    });

    setBulkFiles(items);
    setBulkCompleted(false);
    const supportedCount = items.filter(i => i.status === 'WAITING').length;
    const unsupportedCount = items.filter(i => i.status === 'UNSUPPORTED').length;

    setBulkProgress({
      total: items.length,
      processed: unsupportedCount,
      success: 0,
      duplicates: 0,
      failed: 0,
      unsupported: unsupportedCount
    });
  };

  const handleBulkFilesSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processRawFiles(e.target.files);
    }
  };

  const handleFolderSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processRawFiles(e.target.files);
    }
  };

  const handleStartBulkProcessing = async () => {
    if (bulkFiles.length === 0 || bulkProcessing) return;

    const CHUNK_SIZE = 25; // 25 files per HTTP request chunk to prevent RAM spikes & timeouts
    const validItems = bulkFiles.filter(i => i.status === 'WAITING');

    if (validItems.length === 0) return;

    setBulkProcessing(true);

    let currentSuccess = bulkProgress.success;
    let currentDuplicates = bulkProgress.duplicates;
    let currentFailed = bulkProgress.failed;
    let currentUnsupported = bulkProgress.unsupported;
    let currentProcessed = currentUnsupported;

    // Create chunks of files
    const chunks = [];
    for (let i = 0; i < validItems.length; i += CHUNK_SIZE) {
      chunks.push(validItems.slice(i, i + CHUNK_SIZE));
    }

    const updatedFiles = [...bulkFiles];

    for (const chunk of chunks) {
      // Mark chunk items as PROCESSING
      chunk.forEach(item => {
        const idx = updatedFiles.findIndex(f => f === item);
        if (idx !== -1) updatedFiles[idx].status = 'PROCESSING';
      });
      setBulkFiles([...updatedFiles]);

      const filesToUpload = chunk.map(i => i.file);
      const relativePathsToUpload = chunk.map(i => i.relativePath);

      try {
        const res = await uploadBulkCandidates(jobId, filesToUpload, relativePathsToUpload);

        if (res.success && res.data && Array.isArray(res.data.items)) {
          const serverItems = res.data.items;

          chunk.forEach((item, cIdx) => {
            const serverResult = serverItems[cIdx] || {};
            const idx = updatedFiles.findIndex(f => f === item);
            if (idx !== -1) {
              const status = serverResult.status || 'FAILED';
              updatedFiles[idx].status = status;
              updatedFiles[idx].result = serverResult;

              if (status === 'SUCCESS') currentSuccess++;
              else if (status === 'DUPLICATE') currentDuplicates++;
              else if (status === 'UNSUPPORTED') currentUnsupported++;
              else currentFailed++;

              currentProcessed++;
            }
          });
        } else {
          // Entire chunk failed
          chunk.forEach(item => {
            const idx = updatedFiles.findIndex(f => f === item);
            if (idx !== -1) {
              updatedFiles[idx].status = 'FAILED';
              updatedFiles[idx].error = res.message || 'Batch request failed.';
              currentFailed++;
              currentProcessed++;
            }
          });
        }
      } catch (err) {
        // Chunk HTTP error
        chunk.forEach(item => {
          const idx = updatedFiles.findIndex(f => f === item);
          if (idx !== -1) {
            updatedFiles[idx].status = 'FAILED';
            updatedFiles[idx].error = err.response?.data?.message || err.message || 'Upload error.';
            currentFailed++;
            currentProcessed++;
          }
        });
      }

      setBulkFiles([...updatedFiles]);
      setBulkProgress({
        total: updatedFiles.length,
        processed: currentProcessed,
        success: currentSuccess,
        duplicates: currentDuplicates,
        failed: currentFailed,
        unsupported: currentUnsupported
      });
    }

    setBulkProcessing(false);
    setBulkCompleted(true);
  };

  const handleClearBulk = () => {
    setBulkFiles([]);
    setBulkCompleted(false);
    setBulkProgress({ total: 0, processed: 0, success: 0, duplicates: 0, failed: 0, unsupported: 0 });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // OUTLOOK SEARCH & PROCESS HANDLERS
  const handleFindOutlookApplications = async (e) => {
    e.preventDefault();
    setOutlookError('');
    setOutlookSummary(null);
    setOutlookProcessResult(null);

    if (!selectedFolder) {
      setOutlookError('Please select an Outlook mail folder.');
      return;
    }

    try {
      setSearchingOutlook(true);
      const folderObj = folders.find(f => f.id === selectedFolder);
      const folderName = folderObj ? folderObj.name : selectedFolder;

      const res = await searchOutlookEmails(jobId, {
        folderId: selectedFolder,
        folderName,
        fromDate,
        toDate
      });

      if (res.success) {
        setOutlookSummary(res.data);
      } else {
        setOutlookError(res.message || 'Failed to search Outlook emails.');
      }
    } catch (err) {
      setOutlookError(err.response?.data?.message || 'Error searching Outlook emails.');
    } finally {
      setSearchingOutlook(false);
    }
  };

  const handleProcessOutlookResumes = async () => {
    if (!outlookSummary || !outlookSummary.applications) return;
    const readyApps = outlookSummary.applications.filter(app => app.resumeAttachment);
    if (readyApps.length === 0) return;

    try {
      setOutlookProcessing(true);
      setOutlookError('');

      const payload = readyApps.map(app => ({
        messageId: app.messageId,
        attachmentId: app.resumeAttachment.attachmentId,
        receivedAt: app.receivedDateTime,
        senderName: app.senderName,
        senderEmail: app.senderEmail,
        fileName: app.resumeAttachment.fileName,
        mimeType: app.resumeAttachment.contentType
      }));

      const res = await processCandidates(jobId, payload);
      if (res.success) {
        setOutlookProcessResult(res.data);
      } else {
        setOutlookError(res.message || 'Failed to process Outlook batch.');
      }
    } catch (err) {
      setOutlookError(err.response?.data?.message || 'Error processing Outlook resumes.');
    } finally {
      setOutlookProcessing(false);
    }
  };

  if (loadingJob) {
    return <RouteSkeleton variant="upload" label="Preparing the resume import workspace..." />;
  }

  const pdfCount = bulkFiles.filter(f => f.ext === '.pdf').length;
  const docxCount = bulkFiles.filter(f => f.ext === '.docx').length;
  const txtCount = bulkFiles.filter(f => f.ext === '.txt').length;
  const ignoredCount = bulkFiles.filter(f => f.status === 'UNSUPPORTED').length;
  const totalSizeBytes = bulkFiles.reduce((acc, f) => acc + f.size, 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-meta text-slate-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/jobs" className="hover:text-slate-900 transition-colors duration-fast font-medium">
              Jobs
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">/</li>
          <li>
            <Link
              to={`/jobs/${jobId}`}
              className="hover:text-slate-900 transition-colors duration-fast font-medium max-w-[16rem] truncate inline-block align-bottom"
            >
              {job?.title || 'Job'}
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">/</li>
          <li className="text-slate-900 font-semibold" aria-current="page">
            Import
          </li>
        </ol>
      </nav>

      <PageHeader
        eyebrow="Candidates"
        title="Add candidates"
        description={`Add resumes to ${job?.title || 'this role'}. Each one is parsed and scored against the job's requirements as it arrives.`}
        actions={
          <>
            <Link to={`/jobs/${jobId}`} className="btn btn-md btn-secondary">
              <Settings2 className="w-4 h-4" aria-hidden="true" />
              Job details
            </Link>
            <Link to={`/jobs/${jobId}/candidates`} className="btn btn-md btn-primary">
              <Users className="w-4 h-4" aria-hidden="true" />
              View candidates
            </Link>
          </>
        }
      />

      {/* A closed job accepts no new candidates. The server enforces this on
          every ingestion endpoint; this replaces the form so a recruiter is not
          left filling in an upload that will be refused. */}
      {job?.status === 'CLOSED' ? (
        <Card>
          <EmptyState
            icon={Lock}
            title="This job is closed"
            description="Candidate imports are disabled for closed jobs. The existing candidates and their scores remain available."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link to={`/jobs/${jobId}`} className="btn btn-sm btn-primary">
                  <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
                  View job
                </Link>
                <Link to={`/jobs/${jobId}/candidates`} className="btn btn-sm btn-secondary">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  View candidates
                </Link>
              </div>
            }
          />
        </Card>
      ) : (
      <div className="card card-pad-lg">
        {/* Source tabs */}
        <div className="flex border-b border-slate-200 gap-1 -mx-1 px-1 overflow-x-auto scroll-slim">
          {[
            { id: 'manual', label: 'Upload resumes', icon: Upload },
            { id: 'outlook', label: 'Outlook mailbox', icon: Mail }
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                className={`relative px-3.5 py-2.5 text-meta font-semibold whitespace-nowrap transition-colors duration-fast rounded-t-control inline-flex items-center gap-2 ${
                  active ? 'text-brand-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-600 rounded-t" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: MANUAL RESUME UPLOAD (SINGLE, BULK & FOLDER) */}
        {activeTab === 'manual' && (
          <div className="mt-6 space-y-8">
            {/*
              One way to add resumes, whatever the shape of the source.
              This used to be two cards — "Single Candidate Upload" and "Bulk &
              Folder Import" — which asked a recruiter to classify their own files
              before they could upload them. Now one file, fifty files or a whole
              folder all arrive the same way and the app works out the rest.
            */}
            <div className="rounded-card border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-card-title text-slate-900">Upload resumes</h3>
              <p className="text-meta text-slate-500 mt-1">
                One resume, several, or a whole folder. PDF, DOCX or TXT.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                onChange={handleBulkFilesSelect}
                className="hidden"
                id="resume-files-input"
              />
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                className="hidden"
                id="resume-folder-input"
              />

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (bulkProcessing) return;
                  const dropped = Array.from(e.dataTransfer?.files || []);
                  if (dropped.length) handleBulkFilesSelect({ target: { files: dropped } });
                }}
                className={`mt-4 rounded-card border-2 border-dashed bg-white px-6 py-10 text-center transition-colors duration-fast ${
                  dragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300'
                }`}
              >
                <Upload className="w-7 h-7 text-slate-400 mx-auto" aria-hidden="true" />
                <p className="text-body font-medium text-slate-800 mt-3">Drag resumes here</p>
                <p className="text-meta text-slate-500 mt-0.5">or</p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={bulkProcessing}
                    className="btn btn-md btn-primary"
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    Choose files
                  </button>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={bulkProcessing}
                    className="btn btn-md btn-secondary"
                  >
                    <Folder className="w-4 h-4" aria-hidden="true" />
                    Select folder
                  </button>
                </div>

                <p className="text-xs text-slate-400 mt-4">PDF · DOCX · TXT</p>
              </div>
            </div>

            {/* BULK PREVIEW & MONITORING SECTION */}
            {bulkFiles.length > 0 && (
              <div className="card card-pad-lg space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                      <FileCheck className="w-5 h-5 text-brand-600" />
                      <span>{bulkFiles.length} resume{bulkFiles.length === 1 ? '' : 's'} ready to add</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Formats: PDF (<strong>{pdfCount}</strong>) | DOCX (<strong>{docxCount}</strong>) | TXT (<strong>{txtCount}</strong>) | Ignored: <strong>{ignoredCount}</strong> | Total Size: <strong>{totalSizeMB} MB</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {!bulkCompleted ? (
                      <button
                        type="button"
                        onClick={handleStartBulkProcessing}
                        disabled={bulkProcessing || bulkFiles.filter(f => f.status === 'WAITING').length === 0}
                        className="btn btn-md btn-primary"
                      >
                        {bulkProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Processing Batch...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" />
                            <span>Start Processing ({bulkFiles.filter(f => f.status === 'WAITING').length})</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        to={`/jobs/${jobId}/candidates`}
                        className="btn btn-md btn-success-soft"
                      >
                        <Users className="w-4 h-4" />
                        <span>View Ranked Candidates</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={handleClearBulk}
                      disabled={bulkProcessing}
                      className="btn btn-md btn-ghost"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                {/* Real progress, driven by files actually processed */}
                <div className="space-y-4">
                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <p className="text-meta font-semibold text-slate-800">
                        {bulkProcessing
                          ? 'Processing candidates'
                          : bulkCompleted
                            ? 'Import complete'
                            : 'Ready to process'}
                      </p>
                      <p className="text-meta text-slate-500 tabular-nums">
                        <span className="font-semibold text-slate-900">
                          {bulkProgress.processed.toLocaleString('en-IN')}
                        </span>{' '}
                        of {bulkProgress.total.toLocaleString('en-IN')}
                        {bulkProgress.total > 0 && (
                          <span className="text-slate-400">
                            {' '}
                            · {Math.round((bulkProgress.processed / bulkProgress.total) * 100)}%
                          </span>
                        )}
                      </p>
                    </div>

                    <ProgressBar
                      value={bulkProgress.processed}
                      max={bulkProgress.total || 1}
                      tone={bulkCompleted ? 'success' : 'brand'}
                      label={
                        bulkProcessing
                          ? `Processing ${bulkProgress.processed} of ${bulkProgress.total} resumes`
                          : 'Import progress'
                      }
                    />
                  </div>

                  {/* Outcome counters. Only non-zero categories draw attention. */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { label: 'Created', value: bulkProgress.success, tone: 'emerald' },
                      { label: 'Duplicates', value: bulkProgress.duplicates, tone: 'amber' },
                      { label: 'Failed', value: bulkProgress.failed, tone: 'rose' },
                      { label: 'Ignored', value: bulkProgress.unsupported, tone: 'slate' }
                    ].map((stat) => {
                      const tones = {
                        emerald: stat.value > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : '',
                        amber: stat.value > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : '',
                        rose: stat.value > 0 ? 'border-rose-200 bg-rose-50 text-rose-800' : '',
                        slate: ''
                      };
                      return (
                        <div
                          key={stat.label}
                          className={`rounded-control border px-3 py-2.5 text-center ${
                            tones[stat.tone] || 'border-slate-200 bg-slate-50 text-slate-700'
                          }`}
                        >
                          <p className="text-lg font-bold tabular-nums leading-none">{stat.value}</p>
                          <p className="text-[11px] font-medium mt-1 opacity-80">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Completion summary with the next obvious action */}
                {bulkCompleted && (
                  <div className="rounded-card border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-pill bg-white text-emerald-600 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h4 className="text-card-title text-emerald-900">Import complete</h4>
                        <p className="text-meta text-emerald-800/90 mt-1">
                          {bulkProgress.success} candidate{bulkProgress.success === 1 ? '' : 's'} created and scored
                          {bulkProgress.duplicates > 0 && `, ${bulkProgress.duplicates} already existed`}
                          {bulkProgress.failed > 0 && `, ${bulkProgress.failed} could not be read`}
                          {bulkProgress.unsupported > 0 && `, ${bulkProgress.unsupported} in an unsupported format`}.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link to={`/jobs/${jobId}/candidates`} className="btn btn-md btn-primary">
                            <Users className="w-4 h-4" aria-hidden="true" />
                            View ranked candidates
                          </Link>
                          <button type="button" onClick={handleClearBulk} className="btn btn-md btn-secondary">
                            Import more
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* File-Level Status Table */}
                <div className="overflow-hidden rounded-card border border-slate-200">
                  <div className="max-h-72 overflow-auto scroll-slim">
                    <table className="data-table min-w-[44rem] text-xs text-slate-700">
                      <thead className="bg-slate-100 sticky top-0 font-semibold text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-2.5">File Name</th>
                          <th className="px-4 py-2.5">Path</th>
                          <th className="px-4 py-2.5">Format</th>
                          <th className="px-4 py-2.5">Status</th>
                          <th className="px-4 py-2.5 text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white font-normal">
                        {bulkFiles.slice(0, 150).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-bold text-slate-900 truncate max-w-xs">{item.fileName}</td>
                            <td className="px-4 py-2 text-slate-500 truncate max-w-xs">{item.relativePath}</td>
                            <td className="px-4 py-2 uppercase text-slate-600">{item.ext.replace('.', '') || 'UNKNOWN'}</td>
                            <td className="px-4 py-2">
                              {item.status === 'SUCCESS' && (
                                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">SUCCESS ({item.result?.score || 0}%)</span>
                              )}
                              {item.status === 'DUPLICATE' && (
                                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Already added</span>
                              )}
                              {item.status === 'FAILED' && (
                                <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded font-bold">FAILED</span>
                              )}
                              {item.status === 'UNSUPPORTED' && (
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">UNSUPPORTED</span>
                              )}
                              {item.status === 'PROCESSING' && (
                                <span className="bg-brand-100 text-brand-800 px-2 py-0.5 rounded font-bold animate-pulse">PROCESSING...</span>
                              )}
                              {item.status === 'WAITING' && (
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded">WAITING</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-500 truncate max-w-xs">
                              {item.result?.message || item.error || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MICROSOFT OUTLOOK INTEGRATION */}
        {activeTab === 'outlook' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-card border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-lg text-white ${outlookConnected ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {outlookConnected ? 'Outlook Account Connected' : 'Outlook Account Not Connected'}
                  </h3>
                  <p className="text-xs text-slate-600">
                    {outlookConnected ? `Connected as ${outlookAccount?.email}` : 'Connect your Microsoft Outlook account to discover candidate applications.'}
                  </p>
                </div>
              </div>

              {outlookConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnectOutlook}
                  className="btn btn-sm btn-secondary shrink-0"
                >
                  Disconnect Account
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/outlook/connect`; }}
                  className="btn btn-sm btn-primary shrink-0"
                >
                  Connect Outlook
                </button>
              )}
            </div>

            {outlookError && <InlineAlert tone="error" message={outlookError} />}

            {/* Outlook Search Form */}
            {outlookConnected && (
              <form onSubmit={handleFindOutlookApplications} className="card card-pad-lg space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <Search className="w-4 h-4 text-brand-600" />
                  <span>Search Outlook Mailbox</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="field-label">Mail Folder</label>
                    <select
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className="select"
                    >
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="field-label">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="input"
                    />
                  </div>

                  <div>
                    <label className="field-label">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="input"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={searchingOutlook}
                    className="btn btn-md btn-primary"
                  >
                    {searchingOutlook ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Searching Mailbox...</span>
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        <span>Find Applications</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Outlook Search Summary Results */}
            {outlookSummary && (
              <div className="rounded-card border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h4 className="text-sm font-bold text-slate-900">
                    Mailbox Scan Results ({outlookSummary.emailsScanned} Emails Scanned)
                  </h4>
                  <button
                    type="button"
                    onClick={handleProcessOutlookResumes}
                    disabled={outlookProcessing || outlookSummary.resumesDiscovered === 0}
                    className="btn btn-sm btn-success-soft"
                  >
                    {outlookProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing Applications...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Process Discovered Resumes ({outlookSummary.resumesDiscovered})</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-xs text-slate-600">
                  Discovered <strong>{outlookSummary.resumesDiscovered}</strong> candidate resume attachments out of {outlookSummary.emailsScanned} emails scanned.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default ImportCandidates;
