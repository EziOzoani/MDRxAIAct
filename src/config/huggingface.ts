// Hugging Face configuration for tattoo classification
export const HUGGING_FACE_CONFIG = {
  // Hugging Face model ID for tattoo detection
  MODEL_ID: 'loremipsum3658/tattoo-detection',
  
  // API endpoint - use proxy in development
  API_URL: import.meta.env.DEV 
    ? '/api/huggingface/models/' 
    : 'https://api-inference.huggingface.co/models/',
  
  // Get API token from environment variable
  getApiToken: () => {
    // In production, this should come from a secure backend
    // For demo purposes, we're using an environment variable
    const token = import.meta.env.VITE_HF_API_TOKEN || process.env.REACT_APP_HF_API_TOKEN || '';
    console.log('Token available:', token ? 'Yes' : 'No');
    return token;
  }
};

// Function to classify an image
export async function classifyTattoo(imageBlob: Blob): Promise<{
  isRealTattoo: boolean;
  confidence: number;
  rawResult?: any;
}> {
  const token = HUGGING_FACE_CONFIG.getApiToken();
  
  if (!token) {
    console.warn('No Hugging Face API token found. Using simulation mode.');
    // Simulate classification for demo purposes
    return {
      isRealTattoo: Math.random() > 0.5,
      confidence: 0.75 + Math.random() * 0.2,
    };
  }

  try {
    console.log('Making request to:', `${HUGGING_FACE_CONFIG.API_URL}${HUGGING_FACE_CONFIG.MODEL_ID}`);
    
    const response = await fetch(
      `${HUGGING_FACE_CONFIG.API_URL}${HUGGING_FACE_CONFIG.MODEL_ID}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: imageBlob
      }
    );

    console.log('Response status:', response.status);

    if (response.status === 503) {
      console.log('Model is loading, retrying in 20 seconds...');
      await new Promise(resolve => setTimeout(resolve, 20000));
      return classifyTattoo(imageBlob); // Retry
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Response Error:', response.status, errorText);
      
      if (response.status === 410) {
        console.warn('Model endpoint not available. Using simulation mode.');
        return {
          isRealTattoo: Math.random() > 0.5,
          confidence: 0.75 + Math.random() * 0.2,
          rawResult: { simulated: true, reason: 'Model endpoint returned 410' }
        };
      }
      
      throw new Error(`API Error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Hugging Face API Response:', result);
    
    // Handle different response formats
    if (Array.isArray(result)) {
      // Format: [{"label": "LABEL_0", "score": 0.9}, {"label": "LABEL_1", "score": 0.1}]
      const label0Score = result.find((r: any) => r.label === 'LABEL_0')?.score || 0;
      const label1Score = result.find((r: any) => r.label === 'LABEL_1')?.score || 0;
      
      // Assuming LABEL_1 is real tattoo and LABEL_0 is fake
      return {
        isRealTattoo: label1Score > label0Score,
        confidence: Math.max(label0Score, label1Score),
        rawResult: result
      };
    } else if (result.label !== undefined) {
      // Single prediction format
      return {
        isRealTattoo: result.label === 'LABEL_1' || result.label === 'real',
        confidence: result.score || 0.5,
        rawResult: result
      };
    } else {
      console.error('Unexpected API response format:', result);
      throw new Error('Unexpected API response format');
    }
  } catch (error) {
    console.error('Classification error:', error);
    throw error;
  }
}