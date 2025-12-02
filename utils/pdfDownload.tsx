// First, install the required dependencies:
// npm install html2canvas jspdf

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Add this function to your Portfolio component or create a separate utility file
export const downloadPortfolioAsPDF = async (fileName = 'portfolio-report') => {
  // Hide sidebar and adjust layout for printing
  const sidebar = document.querySelector('[data-sidebar]') as HTMLElement;
  const mainContent = document.querySelector('.lg\\:pl-64') as HTMLElement;
  const portfolioContent = document.querySelector('[data-portfolio-content]') as HTMLElement;

  // Store original styles
  const originalSidebarDisplay = sidebar?.style.display;
  const originalMainPadding = mainContent?.style.paddingLeft;

  try {
    // Hide sidebar and remove left padding
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.paddingLeft = '0';

    // Wait for layout to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    if (!portfolioContent) {
      throw new Error('Portfolio content not found');
    }

    // Get the full height of the content
    const contentHeight = portfolioContent.scrollHeight;
    const contentWidth = portfolioContent.scrollWidth;

    // Capture the entire content as canvas with high quality
    const canvas = await html2canvas(portfolioContent, {
      height: contentHeight,
      width: contentWidth,
      useCORS: true,
      allowTaint: true,
      scale: 2, // Higher resolution
      scrollX: 0,
      scrollY: 0,
      windowWidth: contentWidth,
      windowHeight: contentHeight,
      backgroundColor: '#ffffff',
      removeContainer: false,
      imageTimeout: 15000,
    });

    // Create PDF in landscape orientation
    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Calculate dimensions
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Calculate scale to fit width while maintaining aspect ratio
    const scale = pdfWidth / canvasWidth;
    const scaledHeight = canvasHeight * scale;

    // If content fits in one page
    if (scaledHeight <= pdfHeight) {
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, scaledHeight);
    } else {
      // Split content across multiple pages
      const totalPages = Math.ceil(scaledHeight / pdfHeight);
      
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) {
          pdf.addPage();
        }

        // Calculate the portion of canvas for this page
        const sourceY = (canvasHeight / totalPages) * i;
        const sourceHeight = Math.min(canvasHeight / totalPages, canvasHeight - sourceY);

        // Create a new canvas for this page section
        const pageCanvas = document.createElement('canvas');
        const pageCtx = pageCanvas.getContext('2d');
        
        pageCanvas.width = canvasWidth;
        pageCanvas.height = sourceHeight;

        if (pageCtx) {
          // Fill with white background
          pageCtx.fillStyle = '#ffffff';
          pageCtx.fillRect(0, 0, canvasWidth, sourceHeight);
          
          // Draw the portion of the original canvas
          pageCtx.drawImage(
            canvas,
            0, sourceY, canvasWidth, sourceHeight, // Source
            0, 0, canvasWidth, sourceHeight        // Destination
          );

          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
          const pageScaledHeight = sourceHeight * scale;
          
          pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfWidth, pageScaledHeight);
        }
      }
    }

    // Save the PDF
    pdf.save(`${fileName}.pdf`);

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    // Restore original styles
    if (sidebar) sidebar.style.display = originalSidebarDisplay || '';
    if (mainContent) mainContent.style.paddingLeft = originalMainPadding || '';
  }
};

// Alternative implementation using page breaks for better content separation
export const downloadPortfolioAsPDFWithPageBreaks = async (fileName = 'portfolio-report') => {
  const sidebar = document.querySelector('[data-sidebar]') as HTMLElement;
  const mainContent = document.querySelector('.lg\\:pl-64') as HTMLElement;
  
  // Store original styles
  const originalSidebarDisplay = sidebar?.style.display;
  const originalMainPadding = mainContent?.style.paddingLeft;

  try {
    // Hide sidebar and remove left padding
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.paddingLeft = '0';

    // Wait for layout to settle
    await new Promise(resolve => setTimeout(resolve, 200));

    // Find all major sections to capture separately
    const sections = document.querySelectorAll('[data-portfolio-content] > div');
    
    if (sections.length === 0) {
      // Fallback to single capture
      return downloadPortfolioAsPDF(fileName);
    }

    const pdf = new jsPDF('landscape', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    let isFirstPage = true;

    for (const section of sections) {
      const sectionElement = section as HTMLElement;
      
      // Skip empty sections
      if (sectionElement.offsetHeight === 0) continue;

      if (!isFirstPage) {
        pdf.addPage();
      }

      const canvas = await html2canvas(sectionElement, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      });

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const scale = Math.min(pdfWidth / canvasWidth, pdfHeight / canvasHeight);
      const scaledWidth = canvasWidth * scale;
      const scaledHeight = canvasHeight * scale;

      // Center the content on the page
      const x = (pdfWidth - scaledWidth) / 2;
      const y = (pdfHeight - scaledHeight) / 2;

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', x, y, scaledWidth, scaledHeight);

      isFirstPage = false;
    }

    pdf.save(`${fileName}.pdf`);

  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    // Restore original styles
    if (sidebar) sidebar.style.display = originalSidebarDisplay || '';
    if (mainContent) mainContent.style.paddingLeft = originalMainPadding || '';
  }
};