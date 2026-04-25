'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { 
  Camera, 
  CameraOff, 
  Circle, 
  Download, 
  Sparkles, 
  Wand2,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Palette,
  Mountain,
  Upload,
  BookOpen,
  ArrowLeft,
  Check,
  Share2
} from 'lucide-react'
import { toast } from 'sonner'

// Step types
type AppStep = 'camera' | 'captured' | 'processing' | 'result'

// Style presets for photo transformation
const STYLE_PRESETS = [
  { id: 'cartoon', name: 'Cartoon', icon: '🎨' },
  { id: 'oil-painting', name: 'Oil Painting', icon: '🖼️' },
  { id: 'watercolor', name: 'Watercolor', icon: '💧' },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: '🌃' },
  { id: 'vintage', name: 'Vintage', icon: '📷' },
  { id: 'anime', name: 'Anime', icon: '✨' },
  { id: 'sketch', name: 'Sketch', icon: '✏️' },
  { id: 'pop-art', name: 'Pop Art', icon: '🎭' },
]

// Background presets
const BACKGROUND_PRESETS = [
  { id: 'beach', name: 'Beach', icon: '🏖️', prompt: 'Beautiful tropical beach at golden hour sunset, palm trees, serene ocean waves, warm lighting' },
  { id: 'city', name: 'City', icon: '🌆', prompt: 'Modern city skyline at night with neon lights, futuristic architecture, urban atmosphere' },
  { id: 'mountain', name: 'Mountain', icon: '🏔️', prompt: 'Majestic snow-capped mountain peaks, clear blue sky, dramatic clouds, alpine meadow' },
  { id: 'forest', name: 'Forest', icon: '🌲', prompt: 'Magical enchanted forest with glowing fireflies, ancient trees, mystical atmosphere, soft light rays' },
  { id: 'space', name: 'Space', icon: '🚀', prompt: 'Futuristic space station window view, Earth in background, stars, sci-fi atmosphere' },
  { id: 'studio', name: 'Studio', icon: '📸', prompt: 'Professional photo studio background, soft gradient lighting, clean minimalist setting' },
  { id: 'garden', name: 'Garden', icon: '🌸', prompt: 'Beautiful flower garden in spring, colorful blooms, soft bokeh, natural sunlight' },
  { id: 'abstract', name: 'Abstract', icon: '🎭', prompt: 'Abstract colorful background with flowing shapes and gradients, artistic, modern' },
]

// API Documentation
const API_DOCS = [
  {
    method: 'POST',
    path: '/api/photobooth/transform',
    description: 'Create a new image transformation job.',
    request: {
      image: 'string (base64) - Required',
      type: '"style" | "background" - Required',
      style: 'string - Required for style type',
      backgroundPrompt: 'string - Required for background type'
    },
    response: { jobId: 'string', status: '"pending"' }
  },
  {
    method: 'GET',
    path: '/api/photobooth/transform?jobId={jobId}',
    description: 'Check job status. Poll every 1 second.',
    response: { status: '"pending" | "processing" | "complete" | "error"', result: 'string?' }
  }
]

// Processing time estimation
const ESTIMATED_PROCESSING_TIME = 35 // seconds

export default function PhotoboothApp() {
  // Step state
  const [currentStep, setCurrentStep] = useState<AppStep>('camera')
  
  // Camera states
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingCamera, setIsLoadingCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  
  // Debug info
  const [debugInfo, setDebugInfo] = useState({
    streamActive: false,
    trackCount: 0,
    trackEnabled: false,
    trackMuted: false,
    trackReadyState: 'unknown',
    videoReadyState: 0,
    videoPaused: true,
    videoEnded: false,
    videoWidth: 0,
    videoHeight: 0,
    videoSrcObject: false,
    computedDisplay: '',
    computedVisibility: '',
    computedOpacity: '',
  })
  
  // Photo states
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [processedPhoto, setProcessedPhoto] = useState<string | null>(null)
  
  // Selection states
  const [transformType, setTransformType] = useState<'style' | 'background'>('style')
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null)
  const [customBackground, setCustomBackground] = useState('')
  
  // Processing states
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingMessage, setProcessingMessage] = useState('')
  const [selectedPresetName, setSelectedPresetName] = useState<string>('')
  
  // UI states
  const [showApiDocs, setShowApiDocs] = useState(false)
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const debugIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Update debug info
  const updateDebugInfo = useCallback(() => {
    const video = videoRef.current
    const stream = streamRef.current
    
    if (!video) return
    
    const track = stream?.getVideoTracks()[0]
    const computed = window.getComputedStyle(video)
    
    setDebugInfo(prev => ({
      ...prev,
      streamActive: stream?.active ?? false,
      trackCount: stream?.getTracks().length ?? 0,
      trackEnabled: track?.enabled ?? false,
      trackMuted: track?.muted ?? false,
      trackReadyState: track?.readyState ?? 'unknown',
      videoReadyState: video.readyState,
      videoPaused: video.paused,
      videoEnded: video.ended,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      videoSrcObject: !!video.srcObject,
      computedDisplay: computed.display,
      computedVisibility: computed.visibility,
      computedOpacity: computed.opacity,
    }))
  }, [])

  // Reset all states
  const resetToCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    
    setIsStreaming(false)
    setCapturedPhoto(null)
    setProcessedPhoto(null)
    setSelectedStyle(null)
    setSelectedBackground(null)
    setCustomBackground('')
    setProcessingProgress(0)
    setCurrentStep('camera')
    setCameraError(null)
  }, [])

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size should be less than 10MB')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (dataUrl) {
        setCapturedPhoto(dataUrl)
        setCameraError(null)
        setCurrentStep('captured')
        toast.success('Photo uploaded!')
      }
    }
    reader.readAsDataURL(file)
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null)
    setIsLoadingCamera(true)
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera not supported')
      setIsLoadingCamera(false)
      return
    }
    
    try {
      console.log('Requesting camera access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      })
      
      console.log('Camera access granted, tracks:', stream.getTracks())
      streamRef.current = stream
      
      const video = videoRef.current
      if (!video) {
        console.error('Video element not available')
        setCameraError('Video element not ready. Please try again.')
        setIsLoadingCamera(false)
        return
      }
      
      console.log('Video element found, assigning stream...')
      
      // Assign stream to video
      video.srcObject = stream
      
      // Wait for video to have valid dimensions before playing
      const waitForVideo = () => {
        return new Promise<void>((resolve, reject) => {
          const checkReady = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              console.log('Video has valid dimensions:', video.videoWidth, 'x', video.videoHeight)
              resolve()
            } else {
              console.log('Waiting for video dimensions...')
              setTimeout(checkReady, 100)
            }
          }
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (video.videoWidth === 0 || video.videoHeight === 0) {
              reject(new Error('Timeout waiting for video'))
            }
          }, 10000)
          
          checkReady()
        })
      }
      
      // Play the video and wait for it to be ready
      await video.play()
      console.log('Video.play() called, waiting for dimensions...')
      
      await waitForVideo()
      
      console.log('Camera ready!')
      setIsStreaming(true)
      setIsLoadingCamera(false)
      toast.success('Camera started!')
      
    } catch (error: unknown) {
      console.error('Error with camera:', error)
      setIsLoadingCamera(false)
      
      let errorMessage = 'Could not access camera. '
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings and try again.'
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = 'No camera found. Please connect a camera and try again.'
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = 'Camera is already in use by another application.'
        } else {
          errorMessage += error.message
        }
      }
      
      setCameraError(errorMessage)
      toast.error(errorMessage)
    }
  }, [])

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) {
      console.error('Video or canvas not available')
      return
    }
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      console.error('Could not get canvas context')
      return
    }
    
    // Check if video has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('Video dimensions are 0:', video.videoWidth, video.videoHeight)
      toast.error('Video not ready. Please wait and try again.')
      return
    }
    
    console.log('Capturing photo, video dimensions:', video.videoWidth, 'x', video.videoHeight)
    
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // Mirror the image horizontally for selfie mode
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    console.log('Photo captured, data URL length:', dataUrl.length)
    
    setCapturedPhoto(dataUrl)
    
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setIsStreaming(false)
    
    setCurrentStep('captured')
    toast.success('Photo captured!')
  }, [])

  // Apply transformation
  const applyTransformation = useCallback(async () => {
    if (!capturedPhoto) return
    
    const preset = transformType === 'style' 
      ? STYLE_PRESETS.find(s => s.id === selectedStyle)
      : BACKGROUND_PRESETS.find(b => b.id === selectedBackground)
    
    const prompt = transformType === 'background' 
      ? (customBackground || preset?.prompt || '')
      : undefined
    
    if (transformType === 'style' && !selectedStyle) {
      toast.error('Please select a style')
      return
    }
    if (transformType === 'background' && !prompt) {
      toast.error('Please select a background or enter custom description')
      return
    }
    
    setSelectedPresetName(preset?.name || 'Custom')
    setCurrentStep('processing')
    setProcessingProgress(0)
    setProcessingMessage(`Starting ${transformType} transformation...`)
    
    // Start progress animation
    let elapsed = 0
    progressIntervalRef.current = setInterval(() => {
      elapsed += 0.5
      const progress = Math.min((elapsed / ESTIMATED_PROCESSING_TIME) * 100, 95)
      setProcessingProgress(progress)
      
      if (elapsed < 5) {
        setProcessingMessage('Analyzing your photo...')
      } else if (elapsed < 15) {
        setProcessingMessage(transformType === 'style' ? 'Applying artistic style...' : 'Generating new background...')
      } else if (elapsed < 25) {
        setProcessingMessage('Processing details...')
      } else {
        setProcessingMessage('Almost done...')
      }
    }, 500)
    
    try {
      // Create job
      const response = await fetch('/api/photobooth/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: capturedPhoto,
          type: transformType,
          style: selectedStyle,
          backgroundPrompt: prompt
        })
      })
      
      if (!response.ok) throw new Error('Failed to start processing')
      
      const { jobId } = await response.json()
      
      // Poll for status
      const maxAttempts = 120
      let attempts = 0
      
      const poll = async (): Promise<void> => {
        attempts++
        const statusRes = await fetch(`/api/photobooth/transform?jobId=${jobId}`)
        const data = await statusRes.json()
        
        if (data.status === 'complete') {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          setProcessingProgress(100)
          setProcessingMessage('Complete!')
          setProcessedPhoto(data.result)
          setTimeout(() => setCurrentStep('result'), 500)
          toast.success(`${preset?.name || 'Transformation'} applied!`)
          return
        }
        
        if (data.status === 'error') {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          toast.error(data.error || 'Processing failed')
          setCurrentStep('captured')
          return
        }
        
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000)
        } else {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          toast.error('Processing timed out')
          setCurrentStep('captured')
        }
      }
      
      await poll()
    } catch (error) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
      toast.error('Failed to process image')
      setCurrentStep('captured')
    }
  }, [capturedPhoto, transformType, selectedStyle, selectedBackground, customBackground])

  // Download photo
  const downloadPhoto = useCallback(async () => {
    if (!processedPhoto) return
    
    try {
      const response = await fetch(processedPhoto)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = url
      link.download = `photobooth-${Date.now()}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Photo downloaded!')
    } catch {
      toast.error('Failed to download')
    }
  }, [processedPhoto])

  // Share photo (if available)
  const sharePhoto = useCallback(async () => {
    if (!processedPhoto) return
    
    try {
      const response = await fetch(processedPhoto)
      const blob = await response.blob()
      const file = new File([blob], 'photobooth-photo.jpg', { type: 'image/jpeg' })
      
      if (navigator.share && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My AI Photo'
        })
        toast.success('Shared!')
      } else {
        toast.info('Sharing not supported on this device')
      }
    } catch {
      toast.error('Failed to share')
    }
  }, [processedPhoto])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      if (debugIntervalRef.current) {
        clearInterval(debugIntervalRef.current)
      }
    }
  }, [])
  
  // Start debug polling when streaming
  useEffect(() => {
    if (isStreaming) {
      debugIntervalRef.current = setInterval(updateDebugInfo, 500)
      updateDebugInfo() // Initial update
    } else {
      if (debugIntervalRef.current) {
        clearInterval(debugIntervalRef.current)
      }
    }
    
    return () => {
      if (debugIntervalRef.current) {
        clearInterval(debugIntervalRef.current)
      }
    }
  }, [isStreaming, updateDebugInfo])

  // Hidden elements
  const HiddenElements = () => (
    <>
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </>
  )

  // API Docs Modal
  const ApiDocsModal = () => (
    <Dialog open={showApiDocs} onOpenChange={setShowApiDocs}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-slate-800 border-slate-700 text-white overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-400" />
            API Documentation
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            REST API endpoints for the AI Photobooth
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {API_DOCS.map((api, i) => (
            <div key={i} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${api.method === 'GET' ? 'bg-green-600' : 'bg-blue-600'}`}>
                  {api.method}
                </span>
                <code className="text-sm text-purple-300">{api.path}</code>
              </div>
              <p className="text-slate-300 text-sm mb-2">{api.description}</p>
              {api.request && (
                <pre className="bg-slate-950 rounded p-2 text-xs text-slate-300 overflow-x-auto">
                  {JSON.stringify(api.request, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )

  // STEP 1: Camera View
  const CameraStep = () => (
    <div className="fixed inset-0 bg-black">
      {/* Video element */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />
      
      {/* Camera not started overlay - only when NOT streaming */}
      {!isStreaming && !isLoadingCamera && !cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
          <div className="flex gap-8 mb-8">
            <button
              onClick={startCamera}
              className="flex flex-col items-center p-6 rounded-2xl bg-slate-800/80 hover:bg-slate-700 transition-colors"
            >
              <Camera className="w-16 h-16 text-green-400 mb-3" />
              <span className="text-white text-lg">Camera</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center p-6 rounded-2xl bg-slate-800/80 hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-16 h-16 text-purple-400 mb-3" />
              <span className="text-white text-lg">Upload</span>
            </button>
          </div>
          <p className="text-slate-400">Tap to start camera or upload a photo</p>
        </div>
      )}
      
      {/* Loading overlay */}
      {isLoadingCamera && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900">
          <Loader2 className="w-16 h-16 animate-spin text-purple-400 mb-4" />
          <p className="text-white text-lg">Starting camera...</p>
        </div>
      )}
      
      {/* Error overlay */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6">
          <CameraOff className="w-16 h-16 text-red-400 mb-4" />
          <p className="text-red-400 text-lg text-center mb-2">{cameraError}</p>
          <p className="text-slate-400 text-center mb-6">You can still use the app by uploading a photo</p>
          <div className="flex gap-4">
            <Button onClick={startCamera} variant="outline" className="px-8 py-6 text-lg">
              Try Again
            </Button>
            <Button onClick={() => fileInputRef.current?.click()} className="px-8 py-6 text-lg bg-purple-600 hover:bg-purple-700">
              <Upload className="w-5 h-5 mr-2" />
              Upload Photo
            </Button>
          </div>
        </div>
      )}
      
      {/* Capture button - only when streaming */}
      {isStreaming && (
        <div className="absolute bottom-0 left-0 right-0 pb-12 pt-8 bg-gradient-to-t from-black/80 to-transparent flex justify-center">
          <button
            onClick={capturePhoto}
            className="w-24 h-24 rounded-full bg-white hover:bg-slate-100 transition-colors flex items-center justify-center shadow-2xl"
          >
            <Circle className="w-14 h-14 text-red-500 fill-red-500" />
          </button>
        </div>
      )}
      
      {/* Debug overlay */}
      {isStreaming && (
        <div className="absolute top-4 left-4 bg-black/80 text-white text-xs p-3 rounded-lg font-mono max-w-xs">
          <div className="text-yellow-400 font-bold mb-2">DEBUG INFO</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span>Stream Active:</span>
            <span className={debugInfo.streamActive ? 'text-green-400' : 'text-red-400'}>
              {debugInfo.streamActive ? 'YES' : 'NO'}
            </span>
            
            <span>Track Count:</span>
            <span>{debugInfo.trackCount}</span>
            
            <span>Track Enabled:</span>
            <span className={debugInfo.trackEnabled ? 'text-green-400' : 'text-red-400'}>
              {debugInfo.trackEnabled ? 'YES' : 'NO'}
            </span>
            
            <span>Track Muted:</span>
            <span className={debugInfo.trackMuted ? 'text-red-400' : 'text-green-400'}>
              {debugInfo.trackMuted ? 'YES' : 'NO'}
            </span>
            
            <span>Track State:</span>
            <span className={debugInfo.trackReadyState === 'live' ? 'text-green-400' : 'text-yellow-400'}>
              {debugInfo.trackReadyState}
            </span>
            
            <span>Video ReadyState:</span>
            <span>{debugInfo.videoReadyState} ({['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][debugInfo.videoReadyState] || 'unknown'})</span>
            
            <span>Video Paused:</span>
            <span className={debugInfo.videoPaused ? 'text-red-400' : 'text-green-400'}>
              {debugInfo.videoPaused ? 'YES' : 'NO'}
            </span>
            
            <span>Video Ended:</span>
            <span className={debugInfo.videoEnded ? 'text-red-400' : 'text-green-400'}>
              {debugInfo.videoEnded ? 'YES' : 'NO'}
            </span>
            
            <span>Video Size:</span>
            <span>{debugInfo.videoWidth}x{debugInfo.videoHeight}</span>
            
            <span>srcObject:</span>
            <span className={debugInfo.videoSrcObject ? 'text-green-400' : 'text-red-400'}>
              {debugInfo.videoSrcObject ? 'SET' : 'NULL'}
            </span>
            
            <span>CSS Display:</span>
            <span>{debugInfo.computedDisplay}</span>
            
            <span>CSS Visibility:</span>
            <span>{debugInfo.computedVisibility}</span>
            
            <span>CSS Opacity:</span>
            <span>{debugInfo.computedOpacity}</span>
          </div>
        </div>
      )}
      
      {/* API Docs button */}
      <button
        onClick={() => setShowApiDocs(true)}
        className="absolute top-4 right-4 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
      >
        <BookOpen className="w-6 h-6 text-white" />
      </button>
    </div>
  )

  // STEP 2: Captured Photo with Options
  const CapturedStep = () => (
    <div className="fixed inset-0 bg-slate-900 flex flex-col">
      {/* Photo preview */}
      <div className="flex-1 flex items-center justify-center p-4">
        <img
          src={capturedPhoto!}
          alt="Captured"
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
        />
      </div>
      
      {/* Bottom panel */}
      <div className="bg-slate-800 border-t border-slate-700 p-4 safe-area-pb">
        {/* Transform type toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setTransformType('style'); setSelectedBackground(null); }}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              transformType === 'style' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <Palette className="w-5 h-5" />
            <span className="font-medium">Style</span>
          </button>
          <button
            onClick={() => { setTransformType('background'); setSelectedStyle(null); }}
            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              transformType === 'background' ? 'bg-purple-600 text-white' : 'bg-slate-700 text-slate-300'
            }`}
          >
            <Mountain className="w-5 h-5" />
            <span className="font-medium">Background</span>
          </button>
        </div>
        
        {/* Options scroll */}
        <div className="overflow-x-auto pb-2 -mx-4 px-4">
          <div className="flex gap-3">
            {transformType === 'style' ? (
              STYLE_PRESETS.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setSelectedStyle(style.id)}
                  className={`flex-shrink-0 w-20 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${
                    selectedStyle === style.id
                      ? 'bg-purple-600 ring-2 ring-purple-400'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <span className="text-2xl mb-1">{style.icon}</span>
                  <span className="text-xs text-white">{style.name}</span>
                </button>
              ))
            ) : (
              BACKGROUND_PRESETS.map((bg) => (
                <button
                  key={bg.id}
                  onClick={() => { setSelectedBackground(bg.id); setCustomBackground(''); }}
                  className={`flex-shrink-0 w-20 h-20 rounded-xl flex flex-col items-center justify-center transition-all ${
                    selectedBackground === bg.id
                      ? 'bg-purple-600 ring-2 ring-purple-400'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <span className="text-2xl mb-1">{bg.icon}</span>
                  <span className="text-xs text-white">{bg.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
        
        {/* Custom background input */}
        {transformType === 'background' && (
          <input
            type="text"
            placeholder="Or type custom background..."
            value={customBackground}
            onChange={(e) => { setCustomBackground(e.target.value); setSelectedBackground(null); }}
            className="w-full mt-3 px-4 py-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        )}
        
        {/* Action buttons */}
        <div className="flex gap-3 mt-4">
          <Button
            onClick={resetToCamera}
            variant="outline"
            className="flex-1 py-6 text-lg border-slate-600"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Retake
          </Button>
          <Button
            onClick={applyTransformation}
            className="flex-1 py-6 text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            disabled={transformType === 'style' ? !selectedStyle : (!selectedBackground && !customBackground)}
          >
            <Sparkles className="w-5 h-5 mr-2" />
            Apply
          </Button>
        </div>
      </div>
    </div>
  )

  // STEP 3: Processing
  const ProcessingStep = () => (
    <div className="fixed inset-0 bg-slate-900 flex flex-col items-center justify-center p-6">
      {/* Original photo (small) */}
      <div className="w-48 h-48 rounded-xl overflow-hidden mb-8 opacity-50">
        <img
          src={capturedPhoto!}
          alt="Original"
          className="w-full h-full object-cover"
        />
      </div>
      
      {/* Processing animation */}
      <div className="relative mb-8">
        <Loader2 className="w-16 h-16 animate-spin text-purple-400" />
      </div>
      
      {/* Progress */}
      <div className="w-full max-w-sm mb-4">
        <Progress value={processingProgress} className="h-3 bg-slate-700" />
      </div>
      
      {/* Status text */}
      <p className="text-white text-xl font-medium mb-2">{processingMessage}</p>
      <p className="text-slate-400">
        Applying {selectedPresetName} {transformType}...
      </p>
      
      {/* Time estimate */}
      <p className="text-slate-500 text-sm mt-4">
        Est. {Math.max(1, Math.round(ESTIMATED_PROCESSING_TIME - (processingProgress / 100) * ESTIMATED_PROCESSING_TIME))}s remaining
      </p>
    </div>
  )

  // STEP 4: Result
  const ResultStep = () => (
    <div className="fixed inset-0 bg-slate-900 flex flex-col">
      {/* Result image */}
      <div className="flex-1 flex items-center justify-center p-4">
        <img
          src={processedPhoto!}
          alt="Result"
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
        />
      </div>
      
      {/* Action buttons */}
      <div className="bg-slate-800 border-t border-slate-700 p-4 safe-area-pb">
        <div className="flex gap-3">
          <Button
            onClick={downloadPhoto}
            className="flex-1 py-6 text-lg bg-green-600 hover:bg-green-700"
          >
            <Download className="w-5 h-5 mr-2" />
            Download
          </Button>
          <Button
            onClick={sharePhoto}
            variant="outline"
            className="flex-1 py-6 text-lg border-slate-600"
          >
            <Share2 className="w-5 h-5 mr-2" />
            Share
          </Button>
          <Button
            onClick={resetToCamera}
            variant="outline"
            className="flex-1 py-6 text-lg border-slate-600"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            New
          </Button>
        </div>
      </div>
    </div>
  )

  // Render current step
  return (
    <>
      <HiddenElements />
      <ApiDocsModal />
      
      {currentStep === 'camera' && <CameraStep />}
      {currentStep === 'captured' && <CapturedStep />}
      {currentStep === 'processing' && <ProcessingStep />}
      {currentStep === 'result' && <ResultStep />}
    </>
  )
}
