'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  Camera, 
  CameraOff, 
  Circle, 
  Download, 
  Sparkles, 
  Wand2, 
  Image as ImageIcon,
  Loader2,
  Trash2,
  RefreshCw,
  Palette,
  Mountain,
  Upload
} from 'lucide-react'
import { toast } from 'sonner'

// Style presets for photo transformation
const STYLE_PRESETS = [
  { id: 'cartoon', name: 'Cartoon', description: 'Fun animated style', icon: '🎨' },
  { id: 'oil-painting', name: 'Oil Painting', description: 'Classic art style', icon: '🖼️' },
  { id: 'watercolor', name: 'Watercolor', description: 'Soft watercolor look', icon: '💧' },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon futuristic style', icon: '🌃' },
  { id: 'vintage', name: 'Vintage', description: 'Retro film look', icon: '📷' },
  { id: 'anime', name: 'Anime', description: 'Japanese anime style', icon: '✨' },
  { id: 'sketch', name: 'Sketch', description: 'Pencil drawing style', icon: '✏️' },
  { id: 'pop-art', name: 'Pop Art', description: 'Bold colorful style', icon: '🎭' },
]

// Background presets
const BACKGROUND_PRESETS = [
  { id: 'beach', name: 'Beach Sunset', prompt: 'Beautiful tropical beach at golden hour sunset, palm trees, serene ocean waves, warm lighting' },
  { id: 'city', name: 'City Skyline', prompt: 'Modern city skyline at night with neon lights, futuristic architecture, urban atmosphere' },
  { id: 'mountain', name: 'Mountain Peak', prompt: 'Majestic snow-capped mountain peaks, clear blue sky, dramatic clouds, alpine meadow' },
  { id: 'forest', name: 'Enchanted Forest', prompt: 'Magical enchanted forest with glowing fireflies, ancient trees, mystical atmosphere, soft light rays' },
  { id: 'space', name: 'Space Station', prompt: 'Futuristic space station window view, Earth in background, stars, sci-fi atmosphere' },
  { id: 'studio', name: 'Photo Studio', prompt: 'Professional photo studio background, soft gradient lighting, clean minimalist setting' },
  { id: 'garden', name: 'Flower Garden', prompt: 'Beautiful flower garden in spring, colorful blooms, soft bokeh, natural sunlight' },
  { id: 'abstract', name: 'Abstract Art', prompt: 'Abstract colorful background with flowing shapes and gradients, artistic, modern' },
]

interface ProcessedPhoto {
  id: string
  original: string
  processed: string | null
  type: 'style' | 'background'
  styleName?: string
  backgroundName?: string
  customPrompt?: string
  timestamp: Date
  isProcessing: boolean
}

export default function PhotoboothApp() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isLoadingCamera, setIsLoadingCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)
  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([])
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null)
  const [customBackground, setCustomBackground] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    
    // Validate file size (max 10MB)
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
        toast.success('Photo uploaded!')
      }
    }
    reader.onerror = () => {
      toast.error('Failed to read the image file')
    }
    reader.readAsDataURL(file)
    
    // Reset the input so the same file can be uploaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  // Trigger file input click
  const triggerFileUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Start camera stream
  const startCamera = useCallback(async () => {
    setCameraError(null)
    setIsLoadingCamera(true)
    
    // Check if camera is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const errorMsg = 'Camera not supported. Please use a modern browser (Chrome, Firefox, Safari, Edge).'
      setCameraError(errorMsg)
      toast.error(errorMsg)
      setIsLoadingCamera(false)
      return
    }
    
    try {
      console.log('Requesting camera access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      })
      
      console.log('Camera access granted, setting up video...')
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        
        // Wait for video to be ready
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded')
          videoRef.current?.play()
            .then(() => {
              console.log('Video playing successfully')
              setIsStreaming(true)
              setIsLoadingCamera(false)
              toast.success('Camera started!')
            })
            .catch((err) => {
              console.error('Error playing video:', err)
              setCameraError('Could not play video stream')
              toast.error('Could not play video stream')
              setIsLoadingCamera(false)
            })
        }
      } else {
        setIsLoadingCamera(false)
      }
    } catch (error: unknown) {
      console.error('Error accessing camera:', error)
      setIsLoadingCamera(false)
      
      let errorMessage = 'Could not access camera. '
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Camera permission denied. Please allow camera access in your browser settings and try again.'
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = 'No camera found. Please connect a camera and try again.'
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = 'Camera is already in use by another application. Please close other apps using the camera.'
        } else if (error.name === 'OverconstrainedError') {
          errorMessage = 'Camera does not meet requirements. Trying with basic settings...'
          // Try again with basic settings
          try {
            const basicStream = await navigator.mediaDevices.getUserMedia({ video: true })
            if (videoRef.current) {
              videoRef.current.srcObject = basicStream
              streamRef.current = basicStream
              await videoRef.current.play()
              setIsStreaming(true)
              toast.success('Camera started with basic settings!')
            }
          } catch {
            setCameraError('Could not access camera with any settings.')
            toast.error('Could not access camera with any settings.')
          }
          return
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'Camera access requires HTTPS. Please ensure you are using a secure connection.'
        } else {
          errorMessage += error.message
        }
      }
      
      setCameraError(errorMessage)
      toast.error(errorMessage)
    }
  }, [])

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  // Capture photo from video stream
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    // Mirror the image horizontally for selfie mode
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0) // Reset transform
    
    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
    setCapturedPhoto(dataUrl)
    toast.success('Photo captured!')
  }, [])

  // Clear captured photo
  const clearCapturedPhoto = useCallback(() => {
    setCapturedPhoto(null)
    setSelectedStyle(null)
    setSelectedBackground(null)
    setCustomBackground('')
  }, [])

  // Helper function to poll for job status
  const pollJobStatus = async (jobId: string, photoId: string, successMessage: string) => {
    const maxAttempts = 120 // 2 minutes max (1 second intervals)
    let attempts = 0

    const poll = async (): Promise<void> => {
      attempts++
      
      try {
        const response = await fetch(`/api/photobooth/transform?jobId=${jobId}`)
        
        if (!response.ok) {
          throw new Error('Failed to check job status')
        }

        const data = await response.json()

        if (data.status === 'complete') {
          setProcessedPhotos(prev => 
            prev.map(p => 
              p.id === photoId 
                ? { ...p, processed: data.result, isProcessing: false }
                : p
            )
          )
          toast.success(successMessage)
          setIsProcessing(false)
          return
        }

        if (data.status === 'error') {
          setProcessedPhotos(prev => prev.filter(p => p.id !== photoId))
          toast.error(data.error || 'Processing failed')
          setIsProcessing(false)
          return
        }

        // Still processing, continue polling
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000) // Poll every 1 second
        } else {
          // Timeout
          setProcessedPhotos(prev => prev.filter(p => p.id !== photoId))
          toast.error('Processing timed out. Please try again.')
          setIsProcessing(false)
        }
      } catch (error) {
        console.error('Poll error:', error)
        // Retry on network error
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000)
        } else {
          setProcessedPhotos(prev => prev.filter(p => p.id !== photoId))
          toast.error('Failed to check processing status')
          setIsProcessing(false)
        }
      }
    }

    await poll()
  }

  // Helper function to handle transformation with polling
  const transformWithPolling = async (
    payload: { image: string; type: 'style' | 'background'; style?: string; backgroundPrompt?: string },
    photoId: string,
    successMessage: string
  ) => {
    try {
      // Create job
      const response = await fetch('/api/photobooth/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start processing')
      }

      const { jobId } = await response.json()
      console.log('Job created:', jobId)

      // Start polling for status
      await pollJobStatus(jobId, photoId, successMessage)
    } catch (error) {
      setProcessedPhotos(prev => prev.filter(p => p.id !== photoId))
      const errorMessage = error instanceof Error ? error.message : 'Transformation failed'
      toast.error(errorMessage)
      console.error('Transform error:', error)
      setIsProcessing(false)
    }
  }

  // Apply style transformation
  const applyStyle = async () => {
    if (!capturedPhoto || !selectedStyle) return
    
    const style = STYLE_PRESETS.find(s => s.id === selectedStyle)
    if (!style) return
    
    const photoId = Date.now().toString()
    const newPhoto: ProcessedPhoto = {
      id: photoId,
      original: capturedPhoto,
      processed: null,
      type: 'style',
      styleName: style.name,
      timestamp: new Date(),
      isProcessing: true
    }
    
    setProcessedPhotos(prev => [newPhoto, ...prev])
    setIsProcessing(true)
    
    await transformWithPolling(
      { image: capturedPhoto, type: 'style', style: selectedStyle },
      photoId,
      `${style.name} style applied!`
    )
  }

  // Apply background transformation
  const applyBackground = async () => {
    if (!capturedPhoto) return
    
    const preset = BACKGROUND_PRESETS.find(b => b.id === selectedBackground)
    const prompt = customBackground || preset?.prompt
    
    if (!prompt) {
      toast.error('Please select a background preset or enter a custom description')
      return
    }
    
    const photoId = Date.now().toString()
    const newPhoto: ProcessedPhoto = {
      id: photoId,
      original: capturedPhoto,
      processed: null,
      type: 'background',
      backgroundName: preset?.name || 'Custom',
      customPrompt: prompt,
      timestamp: new Date(),
      isProcessing: true
    }
    
    setProcessedPhotos(prev => [newPhoto, ...prev])
    setIsProcessing(true)
    
    await transformWithPolling(
      { image: capturedPhoto, type: 'background', backgroundPrompt: prompt },
      photoId,
      'Background generated!'
    )
  }

  // Download processed photo
  const downloadPhoto = async (photo: ProcessedPhoto) => {
    const imageUrl = photo.processed || photo.original
    
    // If it's an external URL, fetch and convert to blob for download
    if (imageUrl.startsWith('http')) {
      try {
        const response = await fetch(imageUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)
        
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `photobooth-${photo.id}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        // If fetch fails, open in new tab
        window.open(imageUrl, '_blank')
        toast.info('Image opened in new tab')
      }
    } else {
      // Base64 data - download directly
      const link = document.createElement('a')
      link.href = imageUrl
      link.download = `photobooth-${photo.id}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  // Delete photo from gallery
  const deletePhoto = (photoId: string) => {
    setProcessedPhotos(prev => prev.filter(p => p.id !== photoId))
    toast.success('Photo deleted')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-r from-pink-500 to-violet-500 rounded-2xl">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">AI Photobooth</h1>
          </div>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto">
            Capture photos and transform them with AI - generate amazing backgrounds or apply artistic styles
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Camera Section */}
          <div className="lg:col-span-2">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Camera className="w-5 h-5" />
                      Camera or Upload
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Capture or upload a photo to get started
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Hidden file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    
                    {/* Upload button - always visible */}
                    <Button 
                      onClick={triggerFileUpload}
                      variant="outline"
                      className="bg-purple-600 hover:bg-purple-700 border-purple-500 text-white"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Photo
                    </Button>
                    
                    {!isStreaming ? (
                      <Button 
                        onClick={startCamera} 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={isLoadingCamera}
                      >
                        {isLoadingCamera ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Camera className="w-4 h-4 mr-2" />
                            Start Camera
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button onClick={stopCamera} variant="destructive">
                        <CameraOff className="w-4 h-4 mr-2" />
                        Stop Camera
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden mb-4">
                  {isStreaming ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                        <Button
                          onClick={capturePhoto}
                          size="lg"
                          className="rounded-full w-16 h-16 bg-white hover:bg-slate-200 shadow-lg"
                        >
                          <Circle className="w-10 h-10 text-red-500 fill-red-500" />
                        </Button>
                      </div>
                    </>
                  ) : capturedPhoto ? (
                    <div className="relative w-full h-full">
                      <img
                        src={capturedPhoto}
                        alt="Captured photo"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-4 right-4 flex gap-2">
                        <Button
                          onClick={clearCapturedPhoto}
                          variant="secondary"
                          size="sm"
                          className="bg-slate-800/80 hover:bg-slate-700"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Retake
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6">
                      {isLoadingCamera ? (
                        <>
                          <Loader2 className="w-16 h-16 mb-4 animate-spin text-purple-500" />
                          <p className="text-lg text-center">Requesting camera access...</p>
                          <p className="text-sm text-center mt-2">Please allow camera permissions when prompted</p>
                        </>
                      ) : cameraError ? (
                        <>
                          <CameraOff className="w-16 h-16 mb-4 text-red-400" />
                          <p className="text-lg text-center text-red-400 mb-2">{cameraError}</p>
                          <p className="text-sm text-center text-slate-400 mb-4">
                            You can still use the app by uploading a photo
                          </p>
                          <div className="flex gap-3">
                            <Button 
                              onClick={startCamera} 
                              variant="outline" 
                            >
                              Try Camera Again
                            </Button>
                            <Button 
                              onClick={triggerFileUpload}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Photo
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex gap-8 mb-6">
                            <div className="flex flex-col items-center">
                              <div className="p-4 rounded-full bg-slate-700 mb-2">
                                <Camera className="w-10 h-10 text-green-400" />
                              </div>
                              <span className="text-sm">Camera</span>
                            </div>
                            <div className="flex items-center text-slate-600">
                              <span className="text-2xl">or</span>
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="p-4 rounded-full bg-slate-700 mb-2">
                                <Upload className="w-10 h-10 text-purple-400" />
                              </div>
                              <span className="text-sm">Upload</span>
                            </div>
                          </div>
                          <p className="text-lg text-center mb-4">
                            Start camera or upload a photo
                          </p>
                          <div className="flex gap-3">
                            <Button 
                              onClick={startCamera} 
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Camera className="w-4 h-4 mr-2" />
                              Start Camera
                            </Button>
                            <Button 
                              onClick={triggerFileUpload}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              Upload Photo
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Transformation Options */}
            {capturedPhoto && (
              <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm mt-6">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Wand2 className="w-5 h-5" />
                    AI Transformations
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Choose a style or generate a new background
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="style" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 bg-slate-700">
                      <TabsTrigger value="style" className="data-[state=active]:bg-purple-600">
                        <Palette className="w-4 h-4 mr-2" />
                        Style Transfer
                      </TabsTrigger>
                      <TabsTrigger value="background" className="data-[state=active]:bg-purple-600">
                        <Mountain className="w-4 h-4 mr-2" />
                        Background
                      </TabsTrigger>
                    </TabsList>

                    {/* Style Transfer Tab */}
                    <TabsContent value="style" className="mt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {STYLE_PRESETS.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => setSelectedStyle(style.id)}
                            className={`p-4 rounded-xl border-2 transition-all text-left ${
                              selectedStyle === style.id
                                ? 'border-purple-500 bg-purple-500/20'
                                : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                            }`}
                          >
                            <div className="text-2xl mb-2">{style.icon}</div>
                            <div className="text-white font-medium text-sm">{style.name}</div>
                            <div className="text-slate-400 text-xs">{style.description}</div>
                          </button>
                        ))}
                      </div>
                      <Button
                        onClick={applyStyle}
                        disabled={!selectedStyle || isProcessing}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Applying Style...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Apply Style
                          </>
                        )}
                      </Button>
                    </TabsContent>

                    {/* Background Tab */}
                    <TabsContent value="background" className="mt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        {BACKGROUND_PRESETS.map((bg) => (
                          <button
                            key={bg.id}
                            onClick={() => {
                              setSelectedBackground(bg.id)
                              setCustomBackground('')
                            }}
                            className={`p-4 rounded-xl border-2 transition-all text-left ${
                              selectedBackground === bg.id
                                ? 'border-purple-500 bg-purple-500/20'
                                : 'border-slate-600 bg-slate-700/50 hover:border-slate-500'
                            }`}
                          >
                            <div className="text-2xl mb-2">
                              {bg.id === 'beach' && '🏖️'}
                              {bg.id === 'city' && '🌃'}
                              {bg.id === 'mountain' && '🏔️'}
                              {bg.id === 'forest' && '🌲'}
                              {bg.id === 'space' && '🚀'}
                              {bg.id === 'studio' && '📸'}
                              {bg.id === 'garden' && '🌸'}
                              {bg.id === 'abstract' && '🎨'}
                            </div>
                            <div className="text-white font-medium text-sm">{bg.name}</div>
                          </button>
                        ))}
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <Label className="text-slate-300 mb-2 block">
                            Or describe your own background
                          </Label>
                          <Input
                            value={customBackground}
                            onChange={(e) => {
                              setCustomBackground(e.target.value)
                              setSelectedBackground(null)
                            }}
                            placeholder="e.g., 'Underwater coral reef with colorful fish'..."
                            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                          />
                        </div>
                        
                        <Button
                          onClick={applyBackground}
                          disabled={(!selectedBackground && !customBackground) || isProcessing}
                          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generating Background...
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-4 h-4 mr-2" />
                              Generate Background
                            </>
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Gallery Section */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-800/50 border-slate-700 backdrop-blur-sm h-full">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Gallery
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Your processed photos ({processedPhotos.length})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {processedPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <ImageIcon className="w-12 h-12 mb-4" />
                    <p>No photos yet</p>
                    <p className="text-sm">Capture and transform photos to see them here</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-4">
                      {processedPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative rounded-xl overflow-hidden border border-slate-600 bg-slate-700/50"
                        >
                          <div className="aspect-square relative">
                            {photo.isProcessing ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                                <div className="text-center">
                                  <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
                                  <p className="text-slate-400 text-sm">Processing...</p>
                                </div>
                              </div>
                            ) : (
                              <img
                                src={photo.processed || photo.original}
                                alt="Processed photo"
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="secondary" className="bg-slate-600">
                                {photo.type === 'style' ? photo.styleName : photo.backgroundName}
                              </Badge>
                              <span className="text-xs text-slate-400">
                                {new Date(photo.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="flex-1 bg-slate-600 hover:bg-slate-500"
                                onClick={() => downloadPhoto(photo)}
                                disabled={photo.isProcessing || !photo.processed}
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deletePhoto(photo.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>AI Photobooth - Powered by AI Vision & Image Generation</p>
        </footer>
      </div>
    </div>
  )
}
